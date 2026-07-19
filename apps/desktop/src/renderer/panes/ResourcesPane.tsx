import { useCallback, useEffect, useState } from "react";

import type {
  ResearchResult,
  ResourceDerivativeItem,
  ResourceSourceItem,
  ResourceTranscriptItem,
  ResourcesOverview,
  ResourcesPreviewResult,
  ResourcesValidationResult,
} from "../../shared/ipc";
import { LogView, SelectField, TextField } from "../components/ui";
import { useStreamLog } from "../lib/hooks";
import { errorMessage } from "../lib/studio";

function slugFromUrl(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1].toLowerCase() : "ruleset";
}

const EMPTY_RESOURCES_OVERVIEW: ResourcesOverview = {
  ok: false,
  error: null,
  sources: { schemaVersion: 1, count: 0, items: [], errors: [], warnings: [] },
  transcripts: { schemaVersion: 1, count: 0, items: [], errors: [], warnings: [] },
  derivatives: { schemaVersion: 1, count: 0, items: [], errors: [], warnings: [] },
};

type ResourceInventoryTab = "sources" | "transcripts" | "derivatives";

export function ResourcesPane() {
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [provider, setProvider] = useState("codex");
  const [distillBusy, setDistillBusy] = useState(false);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [overview, setOverview] = useState<ResourcesOverview>(EMPTY_RESOURCES_OVERVIEW);
  const [validation, setValidation] = useState<ResourcesValidationResult | null>(null);
  const [tab, setTab] = useState<ResourceInventoryTab>("sources");
  const [preview, setPreview] = useState<ResourcesPreviewResult | null>(null);
  const [selectedDerivative, setSelectedDerivative] = useState<ResourceDerivativeItem | null>(null);
  const [reviewedSkillPath, setReviewedSkillPath] = useState("");
  const [log, setLog] = useStreamLog(window.studio.onResearchLog);

  const loadOverview = useCallback(async () => {
    setInventoryBusy(true);
    try {
      setOverview(await window.studio.resources.list());
    } catch (error) {
      setOverview({ ...EMPTY_RESOURCES_OVERVIEW, error: errorMessage(error) });
    } finally {
      setInventoryBusy(false);
    }
  }, []);

  const validateResources = useCallback(async () => {
    setActionBusy("validate");
    setLog("");
    try {
      setValidation(await window.studio.resources.validate());
    } catch (error) {
      setLog(errorMessage(error));
    } finally {
      setActionBusy("");
    }
  }, [setLog]);

  useEffect(() => {
    void loadOverview();
    void validateResources();
  }, [loadOverview, validateResources]);

  async function distill() {
    setDistillBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.research({
        url: url.trim(),
        slug: slug.trim() || slugFromUrl(url),
        provider,
      }));
    } catch (error) {
      setLog(errorMessage(error));
    } finally {
      setDistillBusy(false);
    }
  }

  async function previewDerivativeItem(item: ResourceDerivativeItem) {
    setActionBusy(`preview:${item.path}`);
    setSelectedDerivative(item);
    setReviewedSkillPath("");
    try {
      setPreview(await window.studio.resources.preview(item.outputPath || item.path));
    } catch (error) {
      setPreview({ ok: false, path: null, content: null, error: errorMessage(error) });
    } finally {
      setActionBusy("");
    }
  }

  async function revealDerivative(item: ResourceDerivativeItem) {
    const revealed = await window.studio.resources.reveal(item.outputPath || item.path);
    if (!revealed.ok) setLog(revealed.error || "could not reveal derivative");
  }

  async function promoteSkill(item: ResourceDerivativeItem, approve: boolean) {
    if (item.kind !== "skill") return;
    setActionBusy(`${approve ? "approve" : "review"}:${item.path}`);
    setLog("");
    try {
      const action = await window.studio.resources.promoteSkill(item.path, approve);
      setLog(action.log || action.error || "");
      if (action.ok && !approve) setReviewedSkillPath(item.path);
      if (action.ok && approve) {
        setReviewedSkillPath("");
        await loadOverview();
      }
    } catch (error) {
      setLog(errorMessage(error));
    } finally {
      setActionBusy("");
    }
  }

  const validationCounts = validation?.counts;
  const validationLabel = actionBusy === "validate"
    ? "validating"
    : validation?.ok
      ? "valid"
      : validation
        ? "needs attention"
        : "not checked";

  return (
    <div className="resources">
      <div className="resources-toolbar">
        <div className={"resources-validation " + (validation?.ok ? "is-valid" : validation ? "is-invalid" : "")}>
          <span className="resources-status-dot" />
          <strong>{validationLabel}</strong>
          {validationCounts && (
            <span>
              {validationCounts.sources} sources · {validationCounts.transcripts} transcripts · {validationCounts.derivatives} derivatives
            </span>
          )}
        </div>
        <div className="resources-toolbar-actions">
          <button className="btn" type="button" disabled={inventoryBusy} onClick={() => void loadOverview()}>
            {inventoryBusy ? "Loading…" : "Reload inventory"}
          </button>
          <button className="btn" type="button" disabled={actionBusy === "validate"} onClick={() => void validateResources()}>
            Validate
          </button>
        </div>
      </div>

      <div className="resources-layout">
        <aside className="resources-inventory">
          <div className="resources-tabs" role="tablist" aria-label="Resource inventory">
            {(["sources", "transcripts", "derivatives"] as ResourceInventoryTab[]).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={tab === kind}
                className={tab === kind ? "is-active" : ""}
                onClick={() => setTab(kind)}
              >
                {kind} <b>{overview[kind].count}</b>
              </button>
            ))}
          </div>

          <div className="resources-list">
            {overview.error && <div className="resources-error">{overview.error}</div>}
            {tab === "sources" && overview.sources.items.map((item: ResourceSourceItem) => (
              <article className="resource-card" key={item.path}>
                <div className="resource-card-head">
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </div>
                <p>{item.slug} · {item.kind} · {item.transcriptCount} transcripts</p>
                <div className="resource-tags">
                  {item.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}
                </div>
              </article>
            ))}
            {tab === "transcripts" && overview.transcripts.items.map((item: ResourceTranscriptItem) => (
              <article className="resource-card" key={item.path}>
                <div className="resource-card-head">
                  <strong>{item.title}</strong>
                  <span className={item.rightsStatus ? "is-rights" : ""}>{item.rightsStatus || "rights unknown"}</span>
                </div>
                <p>{item.sourceSlug} · {item.transcriptFormat} · {item.derivativeCount} candidates</p>
                <code>{item.path}</code>
              </article>
            ))}
            {tab === "derivatives" && overview.derivatives.items.map((item: ResourceDerivativeItem) => (
              <article
                className={"resource-card is-actionable" + (selectedDerivative?.path === item.path ? " is-selected" : "")}
                key={item.path}
              >
                <div className="resource-card-head">
                  <strong>{item.title}</strong>
                  <span>{item.kind} · {item.status}</span>
                </div>
                <p>{item.summary || `${item.sourceTranscriptCount} source transcripts`}</p>
                <div className="resource-card-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={actionBusy === `preview:${item.path}`}
                    onClick={() => void previewDerivativeItem(item)}
                  >
                    Review
                  </button>
                  <button className="btn" type="button" onClick={() => void revealDerivative(item)}>Reveal</button>
                  {item.kind === "skill" && (
                    <button
                      className="btn"
                      type="button"
                      disabled={actionBusy === `review:${item.path}`}
                      onClick={() => void promoteSkill(item, false)}
                    >
                      Promotion check
                    </button>
                  )}
                  {item.kind === "skill" && reviewedSkillPath === item.path && (
                    <button
                      className="btn btn-primary resource-approve"
                      type="button"
                      disabled={actionBusy === `approve:${item.path}`}
                      onClick={() => void promoteSkill(item, true)}
                    >
                      Promote reviewed skill
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!inventoryBusy && overview[tab].items.length === 0 && (
              <div className="resources-empty">No {tab} in the manifest inventory.</div>
            )}
          </div>
          <p className="resources-rights-note">
            Transcript bodies are never loaded into this pane. Only sidecar metadata and explicit rights status cross IPC.
          </p>
        </aside>

        <section className="resources-workspace">
          <div className="resources-distill">
            <div className="resources-section-head">
              <div>
                <span>Distill</span>
                <strong>Source → reviewed rules</strong>
              </div>
              <span>streaming CLI</span>
            </div>
            <div className="resources-distill-fields">
              <TextField label="YouTube URL" grow value={url} onChange={setUrl} placeholder="https://www.youtube.com/watch?v=…" />
              <TextField label="Rules file slug" value={slug} onChange={setSlug} placeholder={url ? slugFromUrl(url) : "ruleset"} />
              <SelectField label="Provider" value={provider} onChange={setProvider}>
                <option value="codex">codex — subscription</option>
                <option value="mock">mock — offline</option>
              </SelectField>
              <button className="btn btn-primary" type="button" disabled={distillBusy || !url.trim()} onClick={distill}>
                {distillBusy ? "Distilling…" : "Distill rules"}
              </button>
            </div>
          </div>

          <div className="resources-preview">
            <div className="resources-section-head">
              <div>
                <span>Review</span>
                <strong>{selectedDerivative?.title || (result?.path ? "Generated rules" : "Derivative preview")}</strong>
              </div>
              {(preview?.path || result?.path) && <code>{preview?.path || result?.path}</code>}
            </div>
            {preview?.content || result?.rules ? (
              <pre className="rules">{preview?.content || result?.rules}</pre>
            ) : (
              <div className="resources-preview-empty">
                {distillBusy ? "distilling…" : "Select a derivative or distill a source to review its output."}
              </div>
            )}
            {preview && !preview.ok && <div className="resources-error">{preview.error}</div>}
            {(log || result) && <LogView err={!!result && !result.ok}>{log || "—"}</LogView>}
          </div>
        </section>
      </div>
    </div>
  );
}
