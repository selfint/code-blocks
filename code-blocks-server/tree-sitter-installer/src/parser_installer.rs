use anyhow::{bail, Context, Result};
use std::{
    fs::read,
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
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
    Downloading,
    Patching,
    Compiling,
}

pub fn install_parser(
    download_cmd: &str,
    library_name: &str,
    install_dir: &Path,
    mut report_progress: Option<impl FnMut(InstallationStatus)>,
) -> Result<PathBuf> {
    if let Some(report_progress) = &mut report_progress {
        report_progress(InstallationStatus::Downloading)
    }
    if !download_parser(download_cmd, install_dir)? {
        bail!("failed to download parser")
    }

    if let Some(report_progress) = &mut report_progress {
        report_progress(InstallationStatus::Patching)
    }
    disable_language_fn_mangle(install_dir).context("failed to disable language fn mangle")?;

    if let Some(report_progress) = &mut report_progress {
        report_progress(InstallationStatus::Compiling)
    }
    compile_parser(install_dir).context("failed to build test parser")?;

    Ok(get_compiled_lib_path(library_name, install_dir))
}

fn download_parser(download_cmd: &str, target_dir: &Path) -> Result<bool> {
    let cmd = download_cmd
        .split_ascii_whitespace()
        .next()
        .context("got empty download command")?;
    let args: Vec<_> = download_cmd.split_ascii_whitespace().skip(1).collect();

    Ok(Command::new(cmd)
        .args(args)
        .arg(target_dir)
        .spawn()
        .context("failed to start download cmd")?
        .wait()
        .context("failed to run download cmd")?
        .success())
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

fn compile_parser(parser_dir: &Path) -> Result<ExitStatus> {
    let cmd = BUILD_CMD.split_ascii_whitespace().next().unwrap();
    let args: Vec<_> = BUILD_CMD.split_ascii_whitespace().skip(1).collect();

    Command::new(cmd)
        .args(args)
        .current_dir(parser_dir)
        .spawn()
        .context("failed to build parser")?
        .wait()
        .context("failed to run build cmd")
}
