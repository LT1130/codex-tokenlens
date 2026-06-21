import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { API_PRICING_CATALOG, clonePricingCatalog, type PricingCatalog, type TokenRates } from "../data/apiPricing";
import type { Messages } from "../i18n/messages";

type PricingSettingsModalProps = {
  catalog: PricingCatalog;
  messages: Messages["pricing"];
  onApply: (catalog: PricingCatalog) => void;
  onClose: () => void;
  onOpenOfficialPricing: () => void;
  onReset: () => void;
};

type RateKey = keyof TokenRates;

export function PricingSettingsModal({ catalog, messages, onApply, onClose, onOpenOfficialPricing, onReset }: PricingSettingsModalProps) {
  const [draft, setDraft] = useState(() => clonePricingCatalog(catalog));
  const [newModel, setNewModel] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  function updateRate(modelId: string, tier: "short" | "long", key: RateKey, value: string) {
    const number = Number(value);
    setDraft((current) => {
      const next = clonePricingCatalog(current);
      const model = next.models[modelId];
      if (!model || !Number.isFinite(number) || number < 0) return current;
      if (tier === "long" && !model.long) model.long = { ...model.short };
      model[tier]![key] = number;
      return next;
    });
  }

  function toggleLongPricing(modelId: string) {
    setDraft((current) => {
      const next = clonePricingCatalog(current);
      const model = next.models[modelId];
      if (!model) return current;
      if (model.long) {
        delete model.long;
        delete model.contextThreshold;
      } else {
        model.contextThreshold = 272_000;
        model.long = { ...model.short };
      }
      return next;
    });
  }

  function updateThreshold(modelId: string, value: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return;
    setDraft((current) => {
      const next = clonePricingCatalog(current);
      next.models[modelId].contextThreshold = Math.round(number);
      return next;
    });
  }

  function addModel() {
    const modelId = newModel.trim().toLowerCase();
    if (!modelId || draft.models[modelId]) return;
    setDraft((current) => {
      const next = clonePricingCatalog(current);
      next.models[modelId] = {
          aliases: [modelId],
          short: { input: 0, cachedInput: 0, output: 0 }
      };
      return next;
    });
    setNewModel("");
  }

  function removeModel(modelId: string) {
    setDraft((current) => {
      const next = clonePricingCatalog(current);
      delete next.models[modelId];
      return next;
    });
  }

  return (
    <div className="pricing-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="pricing-modal" role="dialog" aria-modal="true" aria-labelledby="pricing-modal-title">
        <div className="pricing-modal__header">
          <div>
            <p>{messages.eyebrow}</p>
            <h2 id="pricing-modal-title">{messages.title}</h2>
            <span>{messages.description}</span>
          </div>
          <button type="button" onClick={onClose} aria-label={messages.close}>×</button>
        </div>

        <div className="pricing-modal__source">
          <div>
            <span>{messages.currentSource(catalog.customized ? messages.customSource : messages.officialSource)}</span>
            <button type="button" onClick={onOpenOfficialPricing}>{messages.viewOfficialPricing}<ExternalLink size={12} /></button>
          </div>
          <div className="pricing-modal__source-note"><span>{messages.unitHint}</span><small>{messages.manualSyncHint}</small></div>
        </div>

        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead>
              <tr>
                <th>{messages.model}</th>
                <PriceHeading label={messages.input} unit={messages.rateUnit} />
                <PriceHeading label={messages.cachedInput} unit={messages.rateUnit} />
                <PriceHeading label={messages.output} unit={messages.rateUnit} />
                <th>{messages.longContext}</th>
                <th>{messages.actions}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(draft.models).map(([modelId, model]) => (
                <tr key={modelId}>
                  <td><strong>{modelId}</strong></td>
                  <td><PriceInput value={model.short.input} onChange={(value) => updateRate(modelId, "short", "input", value)} /></td>
                  <td><PriceInput value={model.short.cachedInput} onChange={(value) => updateRate(modelId, "short", "cachedInput", value)} /></td>
                  <td><PriceInput value={model.short.output} onChange={(value) => updateRate(modelId, "short", "output", value)} /></td>
                  <td>
                    {model.long ? (
                      <div className="long-price-editor">
                        <label>{messages.threshold}<input type="number" min="1" step="1000" value={model.contextThreshold ?? 272_000} onChange={(event) => updateThreshold(modelId, event.target.value)} /></label>
                        <small>{messages.longOrder}</small>
                        <div>
                          <PriceInput value={model.long.input} onChange={(value) => updateRate(modelId, "long", "input", value)} />
                          <PriceInput value={model.long.cachedInput} onChange={(value) => updateRate(modelId, "long", "cachedInput", value)} />
                          <PriceInput value={model.long.output} onChange={(value) => updateRate(modelId, "long", "output", value)} />
                        </div>
                      </div>
                    ) : <span className="pricing-table__muted">{messages.disabled}</span>}
                  </td>
                  <td>
                    <div className="pricing-row-actions">
                      <button type="button" onClick={() => toggleLongPricing(modelId)}>{model.long ? messages.disableLong : messages.enableLong}</button>
                      <button type="button" className="pricing-row-actions__danger" onClick={() => removeModel(modelId)}>{messages.remove}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pricing-add-model">
          <input value={newModel} onChange={(event) => setNewModel(event.target.value)} placeholder={messages.modelPlaceholder} onKeyDown={(event) => event.key === "Enter" && addModel()} />
          <button type="button" onClick={addModel}>{messages.addModel}</button>
        </div>

        <div className="pricing-modal__footer">
          <button type="button" className="pricing-button pricing-button--secondary" onClick={onReset}>{messages.reset}</button>
          <span>{messages.localOnly}</span>
          <button type="button" className="pricing-button pricing-button--secondary" onClick={onClose}>{messages.cancel}</button>
          <button type="button" className="pricing-button pricing-button--primary" onClick={() => onApply({
            ...draft,
            version: `${API_PRICING_CATALOG.version}-custom`,
            source: "local-custom",
            customized: true
          })}>{messages.save}</button>
        </div>
      </section>
    </div>
  );
}

function PriceInput({ value, onChange }: { value: number; onChange: (value: string) => void }) {
  return <input className="price-input" type="number" min="0" step="0.001" value={value} onChange={(event) => onChange(event.target.value)} />;
}

function PriceHeading({ label, unit }: { label: string; unit: string }) {
  return <th className="price-heading"><span>{label}</span><small>{unit}</small></th>;
}
