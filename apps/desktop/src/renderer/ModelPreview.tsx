// Public entry for the Studio 3D pane. The heavy three.js viewer lives in
// ModelViewer; this wrapper remounts it under `key={src}` so each new model gets
// a fresh viewer instance with clean loading/error state. That replaces an
// in-effect reset (setError/setLoading on every `src` change), which both
// resynchronised state to a prop and cascaded two setState calls per change
// (react-doctor/no-adjust-state-on-prop-change + no-cascading-set-state).
import { ModelViewer, type ModelViewerProps } from "./ModelViewer";

export type ModelPreviewProps = ModelViewerProps;

export function ModelPreview(props: ModelPreviewProps) {
  return <ModelViewer key={props.src} {...props} />;
}
