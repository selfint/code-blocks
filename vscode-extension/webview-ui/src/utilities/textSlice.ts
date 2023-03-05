export function textSlice(
  start: number,
  end: number,
  text: string,
  sliceLengthLimit: number,
  removeTrailingNewLine: boolean,
  startCol: number
): string {
  let slice: string;
  if (end - start < sliceLengthLimit) {
    slice = text.substring(start, end);
  } else {
    slice =
      text.substring(start, start + (sliceLengthLimit * 3) / 4) +
      "..." +
      text.substring(end - sliceLengthLimit / 4, end);
  }

  if (removeTrailingNewLine) {
    slice = slice;
  } else {
    slice = slice;
  }

  return slice;
}
