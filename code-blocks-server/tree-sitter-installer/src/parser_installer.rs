use anyhow::{anyhow, Context, Result};
use std::{
    fs::read,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Output},
    str::from_utf8,
};

const BUILD_CMD: &str = "cargo rustc --crate-type=dylib --release";

pub fn get_compiled_lib_path(library_name: &str, install_dir: &Path) -> PathBuf {
    install_dir.join("target").join("release").join(format!(
        "{}{}{}",
        std::env::consts::DLL_PREFIX,
        library_name,
        std::env::consts::DLL_SUFFIX
    ))
}

pub fn is_installed_at(library_name: &str, install_dir: &Path) -> bool {
    get_compiled_lib_path(library_name, install_dir).exists()
}

#[derive(Debug)]
pub enum InstallationStatus {
    Downloading(String),
    Patching,
    Compiling(String),
}

pub fn install_parser(
    download_cmd: &str,
    library_name: &str,
    install_dir: &Path,
    mut report_progress: Option<impl FnMut(InstallationStatus)>,
) -> Result<PathBuf> {
    if let Some(report_progress) = &mut report_progress {
        report_progress(InstallationStatus::Downloading("Start".to_string()));
    }
    download_parser(download_cmd, install_dir, &mut report_progress)?;
    if let Some(report_progress) = &mut report_progress {
        report_progress(InstallationStatus::Downloading("Done".to_string()));
    }

    if let Some(report_progress) = &mut report_progress {
        report_progress(InstallationStatus::Patching);
    }
    disable_language_fn_mangle(install_dir).context("failed to disable language fn mangle")?;

    if let Some(report_progress) = &mut report_progress {
        report_progress(InstallationStatus::Compiling("Start".to_string()));
    }
    compile_parser(install_dir, &mut report_progress)?;

    Ok(get_compiled_lib_path(library_name, install_dir))
}

fn _run_cmd_with_progress(
    cmd: &mut Command,
    report_progress: &mut Option<impl FnMut(String)>,
) -> Result<Output> {
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .context("failed to start cmd")?;

    let stdout = child.stdout.take().context("failed to read stdout")?;
    let stderr = child.stderr.take().context("failed to read stdout")?;

    let mut out_lines = BufReader::new(stdout).lines();
    let mut error_lines = BufReader::new(stderr).lines();

    while child.try_wait()?.is_none() {
        while let Some(Ok(line)) = out_lines.next() {
            if let Some(report_progress) = report_progress {
                report_progress(line);
            }
        }
        while let Some(Ok(line)) = error_lines.next() {
            if let Some(report_progress) = report_progress {
                report_progress(line);
            }
        }
    }

    // final lines
    while let Some(Ok(line)) = out_lines.next() {
        if let Some(report_progress) = report_progress {
            report_progress(line);
        }
    }
    while let Some(Ok(line)) = error_lines.next() {
        if let Some(report_progress) = report_progress {
            report_progress(line);
        }
    }

    child.wait_with_output().context("failed to run cmd")
}

fn download_parser(
    download_cmd: &str,
    target_dir: &Path,
    report_progress: &mut Option<impl FnMut(InstallationStatus)>,
) -> Result<()> {
    let cmd = download_cmd
        .split_ascii_whitespace()
        .next()
        .context("got empty download command")?;
    let args: Vec<_> = download_cmd.split_ascii_whitespace().skip(1).collect();

    if let Some(report_progress) = report_progress {
        report_progress(InstallationStatus::Downloading(format!(
            "Running command '{} {}'",
            download_cmd,
            target_dir.to_string_lossy()
        )))
    }

    let mut outputs = vec![];
    let mut report_progress = report_progress.as_mut().map(|report_progress| {
        |line: String| {
            outputs.push(line.clone());
            report_progress(InstallationStatus::Downloading(line));
        }
    });

    let output = _run_cmd_with_progress(
        Command::new(cmd).args(args).arg(target_dir),
        &mut report_progress,
    )?;

    if !output.status.success() {
        Err(anyhow!("failed to download parser: {}", outputs.join("\n")))
    } else {
        Ok(())
    }
}

fn disable_language_fn_mangle(parser_dir: &Path) -> Result<()> {
    let lib_file = parser_dir.join("bindings").join("rust").join("lib.rs");
    let lib_file_buf = read(&lib_file).context("failed to read lib.rs file")?;
    let lib_file_src = from_utf8(&lib_file_buf).context("failed to decode lib.rs content")?;

    let pattern = "pub fn language";
    let no_mangle_fn_locations = lib_file_src
        .match_indices(pattern)
        .map(|(byte, _)| byte)
        .collect::<Vec<_>>();

    let mut new_lib_file_src = lib_file_src.to_string();

    for loc in no_mangle_fn_locations.into_iter().rev() {
        new_lib_file_src.insert_str(loc, "#[no_mangle]\n")
    }

    std::fs::write(lib_file, new_lib_file_src).context("failed to write new lib file src")
}

fn compile_parser(
    parser_dir: &Path,
    report_progress: &mut Option<impl FnMut(InstallationStatus)>,
) -> Result<()> {
    let cmd = BUILD_CMD.split_ascii_whitespace().next().unwrap();
    let args: Vec<_> = BUILD_CMD.split_ascii_whitespace().skip(1).collect();

    let mut outputs = vec![];
    let mut report_progress = report_progress.as_mut().map(|report_progress| {
        |line: String| {
            outputs.push(line.clone());
            report_progress(InstallationStatus::Compiling(line));
        }
    });

    let output = _run_cmd_with_progress(
        Command::new(cmd).args(args).current_dir(parser_dir),
        &mut report_progress,
    )?;

    if !output.status.success() {
        Err(anyhow!("failed to compile parser: {}", outputs.join("\n")))
    } else {
        Ok(())
    }
}
