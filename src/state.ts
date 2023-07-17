import * as vscode from "vscode";

export type State<T> = {
    get: () => T;
    set: (newValue: T) => void;
    onDidChange: vscode.Event<T>;
};

export function state<T>(initial: T): State<T> {
    let inner = initial;
    const emitter = new vscode.EventEmitter<T>();

    return {
        get: (): T => inner,
        set: (newValue: T): void => {
            inner = newValue;
            emitter.fire(newValue);
        },
        onDidChange: emitter.event,
    };
}
