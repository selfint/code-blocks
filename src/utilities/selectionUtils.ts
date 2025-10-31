import type { SyntaxNode } from "tree-sitter";
import * as vscode from "vscode";

export type Pair = {
    open: { text: string; range: vscode.Range };
    close: { text: string; range: vscode.Range };
    contentRange: vscode.Range;
    node: SyntaxNode;
};

function pointToPosition(point: { row: number; column: number }): vscode.Position {
    return new vscode.Position(point.row, point.column);
}

function nodeToRange(node: SyntaxNode): vscode.Range {
    return new vscode.Range(pointToPosition(node.startPosition), pointToPosition(node.endPosition));
}

function getPairFromDelimiters(
    node: SyntaxNode,
    openDelimiter: SyntaxNode | null | undefined,
    closeDelimiter: SyntaxNode | null | undefined,
): Pair | undefined {
    if (!openDelimiter || !closeDelimiter) {
        return undefined;
    }

    const openRange = nodeToRange(openDelimiter);
    const closeRange = nodeToRange(closeDelimiter);
    const contentRange = new vscode.Range(openRange.end, closeRange.start);

    return {
        open: { text: openDelimiter.text, range: openRange },
        close: { text: closeDelimiter.text, range: closeRange },
        contentRange,
        node,
    };
}

/**
 * Finds the closest structural pair that contains the given starting node.
 *
 * How it works:
 * 1. It starts at the given `startNode` (usually the node under the cursor).
 * 2. It travels *up* the syntax tree, checking each parent node.
 * 3. For each parent node, it checks if its `type` matches a known "pair" type (e.g., "object", "array", "arguments").
 * 4. For most standard pairs, the opening and closing delimiters are simply the first and last children of the node (e.g., `{` and `}` for an "object").
 * 5. For special cases like "jsx_element", it performs a more specific check to find the opening and closing tags.
 * 6. Once a valid pair is found, it returns a `Pair` object with the ranges for the delimiters and the content.
 *    If it reaches the top of the tree without finding a pair, it returns `undefined`.
 *
 * @param startNode The node to start searching from. The search goes upwards from here.
 * @returns A `Pair` object if a containing pair is found, otherwise `undefined`.
 */
export function findContainingPair(startNode: SyntaxNode | null | undefined): Pair | undefined {
    let node = startNode;
    while (node) {
        const open = node.firstChild;
        const close = node.lastChild;

        // Edge-based pair builder for grammars that don't expose delimiters as child nodes
        const makeEdgePair = (openText: string, closeText: string): Pair => {
            const node_ = node!;
            const startPos = pointToPosition(node_.startPosition);
            const endPos = pointToPosition(node_.endPosition);

            const openStart = startPos;
            const openEnd = new vscode.Position(openStart.line, openStart.character + openText.length);

            const closeEnd = endPos;
            const closeStart = new vscode.Position(closeEnd.line, closeEnd.character - closeText.length);

            return {
                open: { text: openText, range: new vscode.Range(openStart, openEnd) },
                close: { text: closeText, range: new vscode.Range(closeStart, closeEnd) },
                contentRange: new vscode.Range(openEnd, closeStart),
                node: node_,
            };
        };
        const detectEdgeDelimiters = (): { open: string; close: string } | undefined => {
            const text = node!.text ?? "";
            const leftTrimmed = text.trimStart();
            const rightTrimmed = text.trimEnd();
            if (leftTrimmed.length === 0 || rightTrimmed.length === 0) return undefined;
            const first = leftTrimmed[0];
            const last = rightTrimmed[rightTrimmed.length - 1];
            const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
            const close = pairs[first];
            if (close !== undefined && last === close) {
                return { open: first, close };
            }
            return undefined;
        };

        switch (node.type) {
            // Use child-delimiter nodes when reliably available
            case "jsx_element":
                if (open?.type === "jsx_opening_element" && close?.type === "jsx_closing_element") {
                    return getPairFromDelimiters(node, open, close);
                }
                break;
            case "element": // HTML/Svelte elements: start_tag ... end_tag
                if (open?.type === "start_tag" && close?.type === "end_tag") {
                    return getPairFromDelimiters(node, open, close);
                }
                break;
            case "jsx_expression":
            case "jsx_opening_element":
            case "jsx_closing_element":
            case "named_imports":
            case "statement_block":
            case "block": // C/C++/C#/Java/Go/Zig/CSS
            case "compound_statement": // C/C++
            case "class_body": // Java/Kotlin
            case "enum_body": // Java/Kotlin
            case "object":
            case "object_type":
            case "object_pattern":
            case "flow_mapping": // YAML { ... }
            case "array":
            case "array_pattern": // JS/TS destructuring
            case "list": // Python [ ... ]
            case "flow_sequence": // YAML [ ... ]
            case "parenthesized_expression":
            case "arguments":
            case "argument_list":
            case "formal_parameters":
            case "parameter_list":
            case "token_tree":
            case "parameters": // e.g. Rust
                return getPairFromDelimiters(node, open, close);
            // Markdown inline fallback: scan text for [] or () pairs within the inline node
            case "inline": {
                const text = node.text ?? "";
                const posAt = (idx: number): vscode.Position => {
                    const base = node!.startPosition;
                    let row = base.row;
                    let col = base.column;
                    for (let i = 0; i < idx && i < text.length; i++) {
                        const ch = text[i];
                        if (ch === "\n") {
                            row++;
                            col = 0;
                        } else {
                            col++;
                        }
                    }
                    return new vscode.Position(row, col);
                };
                const buildPair = (openIdx: number, closeIdx: number, openChar: string, closeChar: string): Pair => {
                    const node_ = node!;
                    const openStart = posAt(openIdx);
                    const openEnd = posAt(openIdx + 1);
                    const closeStart = posAt(closeIdx);
                    const closeEnd = posAt(closeIdx + 1);
                    return {
                        open: { text: openChar, range: new vscode.Range(openStart, openEnd) },
                        close: { text: closeChar, range: new vscode.Range(closeStart, closeEnd) },
                        contentRange: new vscode.Range(openEnd, closeStart),
                        node: node_,
                    };
                };
                // Prefer selecting [] around link text before () url
                const sqOpen = text.indexOf("[");
                const sqClose = sqOpen >= 0 ? text.indexOf("]", sqOpen + 1) : -1;
                if (sqOpen >= 0 && sqClose > sqOpen) {
                    return buildPair(sqOpen, sqClose, "[", "]");
                }
                const parenOpen = text.indexOf("(");
                const parenClose = parenOpen >= 0 ? text.indexOf(")", parenOpen + 1) : -1;
                if (parenOpen >= 0 && parenClose > parenOpen) {
                    return buildPair(parenOpen, parenClose, "(", ")");
                }
                break;
            }
            // Strings (best-effort; quotes are usually edge tokens)
            case "string":
            case "string_literal": {
                const d = detectEdgeDelimiters();
                if (d && (d.open === '"' || d.open === "'" || d.open === "`")) {
                    return makeEdgePair(d.open, d.close);
                }
                break;
            }
        }

        node = node.parent;
    }

    return undefined;
}
