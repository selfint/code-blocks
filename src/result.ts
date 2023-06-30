export type Result<T, E> = { status: "ok"; result: T } | { status: "err"; result: E };
export function ok<T, E>(result: T): Result<T, E> {
    return { status: "ok", result };
}
export function err<T, E>(result: E): Result<T, E> {
    return { status: "err", result };
}
