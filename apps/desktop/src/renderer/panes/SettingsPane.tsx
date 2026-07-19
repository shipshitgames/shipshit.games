import { useEffect } from "react";

import type { FalModelInfo, Settings } from "../../shared/ipc";
import { SelectField } from "../components/ui";
import { usePatchState } from "../lib/hooks";
import { ASSET_DEFAULTS, KEYED, PROVIDERS } from "../lib/sections";
import { withSettingsDefaults } from "../lib/studio";

export function SettingsPane() {
  const [state, patch] = usePatchState({
    settings: withSettingsDefaults({}),
    games: ["scourge-survivors"] as string[],
    status: {} as Record<string, boolean>,
    inputs: {} as Record<string, string>,
    falModels: [] as FalModelInfo[],
    // Catalog facts sourced from assetgen over studio:models (the single source
    // of truth), not local copies: the per-kind routing defaults and the set of
    // kinds fal can render. Both seed UI fallbacks; settings:get/set stay
    // authoritative.
    catalogDefaults: {} as Record<string, string>,
    falModelKinds: new Set<string>(),
  });
  const { settings, games, status, inputs, falModels, catalogDefaults, falModelKinds } = state;

  useEffect(() => {
    window.studio?.settings.get().then((s) => patch({ settings: withSettingsDefaults(s) })).catch(() => {});
    window.studio?.keys.status().then((status) => patch({ status })).catch(() => {});
    window.studio?.models?.list().then((m) => {
      patch({
        falModels: m?.fal || [],
        catalogDefaults: m?.defaultProviderByKind || {},
        falModelKinds: new Set(m?.falImageKinds || []),
      });
    }).catch(() => {});
    window.studio?.projects.list().then((state) => {
      const slugs = state.projects.map((project) => project.slug);
      if (slugs.length) patch({ games: slugs });
    }).catch(() => {
      window.studio?.listGames().then((g) => g?.length && patch({ games: g })).catch(() => {});
    });
  }, [patch]);

  const update = (p: Partial<Settings>) =>
    window.studio?.settings.set(p).then((s) => patch({ settings: withSettingsDefaults(s) })).catch(() => {});
  const updateKindProvider = (kind: string, provider: string) => update({
    providerDefaults: { ...settings.providerDefaults, [kind]: provider },
  });
  // Empty value = "provider default": delete the key instead of storing "".
  const updateKindFalModel = (kind: string, model: string) => {
    const falModelDefaults = { ...settings.falModelDefaults };
    if (model) falModelDefaults[kind] = model;
    else delete falModelDefaults[kind];
    update({ falModelDefaults });
  };
  const saveKey = (provider: string) => {
    const key = inputs[provider];
    if (!key) return;
    window.studio?.keys.set(provider, key)
      .then((status) => patch((current) => ({ status, inputs: { ...current.inputs, [provider]: "" } })))
      .catch(() => {});
  };

  return (
    <div className="settings">
      <div className="set-group">
        <div className="set-group-title">Defaults</div>
        <SelectField label="Fallback provider" value={settings.defaultProvider} onChange={(defaultProvider) => update({ defaultProvider })}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </SelectField>
        <SelectField label="Default game" value={settings.defaultGame} onChange={(defaultGame) => update({ defaultGame })}>
          {games.map((g) => <option key={g} value={g}>{g}</option>)}
        </SelectField>
      </div>
      <div className="set-group">
        <div className="set-group-title">Provider by asset type</div>
        {ASSET_DEFAULTS.map((item) => (
          <label className="set-provider-row" key={item.kind}>
            <span>{item.label}</span>
            <select value={settings.providerDefaults[item.kind] || catalogDefaults[item.kind] || settings.defaultProvider} onChange={(e) => updateKindProvider(item.kind, e.target.value)}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="set-group">
        <div className="set-group-title">fal.ai model by asset type</div>
        {ASSET_DEFAULTS.flatMap((item) => {
          if (!falModelKinds.has(item.kind)) return [];
          const chosen = settings.falModelDefaults[item.kind] || "";
          return [(
            <label className="set-provider-row" key={item.kind}>
              <span>{item.label}</span>
              <select value={chosen} onChange={(e) => updateKindFalModel(item.kind, e.target.value)}>
                <option value="">Provider default (FLUX.1 dev)</option>
                {falModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                {chosen && !falModels.some((m) => m.id === chosen) && <option value={chosen}>{chosen} (custom)</option>}
              </select>
            </label>
          )];
        })}
      </div>
      <div className="set-group">
        <div className="set-group-title">API keys — only for key-based providers</div>
        <p className="note">Codex uses your ChatGPT/Codex subscription — no key needed. Key-based providers are stored in your macOS keychain.</p>
        {KEYED.map((k) => (
          <div className="set-key-row" key={k.id}>
            <span className="label">{k.label}</span>
            <input type="password" aria-label={`${k.label} API key`} placeholder={status[k.id] ? "•••••••• stored" : "paste key"} value={inputs[k.id] || ""} onChange={(e) => patch((current) => ({ inputs: { ...current.inputs, [k.id]: e.target.value } }))} />
            <button className="btn" type="button" onClick={() => saveKey(k.id)}>Save</button>
            <span className={"badge " + (status[k.id] ? "badge-success" : "badge-muted")}>{status[k.id] ? "set" : "none"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
