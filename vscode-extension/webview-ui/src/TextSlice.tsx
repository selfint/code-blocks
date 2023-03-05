import { JSX } from "solid-js";
import "./TextSlice.css";

type TextSliceProps = {
  text: string;
};

export default function TextSlice({ text }: TextSliceProps): JSX.Element {
  return <span class="text">{text}</span>;
}
