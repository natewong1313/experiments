import type { SessionConfigOption } from "@agentclientprotocol/sdk";

export type AcpModel = { provider: string; id: string; name?: string };

/** The ID of the session config option that selects the model. */
export const MODEL_CONFIG_ID = "model";

/** The current session model, with a provider and model ID. */
export type SessionModel = { readonly provider: string; readonly modelId: string };

/** Returns the config value of a model: its provider and ID, joined with a slash. */
export function modelValue(provider: string, id: string): string {
  return `${provider}/${id}`;
}

/**
 * Returns the config options of a session with `current` as its model. Without models, or
 * without a current model, a session has no options. A current model that is not in `models`
 * is an option too, so the option always holds its value.
 */
export function modelConfigOptions(
  models: readonly AcpModel[],
  current: SessionModel | undefined,
): SessionConfigOption[] {
  if (models.length === 0 || !current) {
    return [];
  }

  const options = models.map((model) => ({
    value: modelValue(model.provider, model.id),
    name: model.name ?? model.id,
  }));

  const currentValue = modelValue(current.provider, current.modelId);

  if (!options.some((option) => option.value === currentValue)) {
    options.push({ value: currentValue, name: current.modelId });
  }

  return [
    {
      type: "select",
      id: MODEL_CONFIG_ID,
      name: "Model",
      category: "model",
      currentValue,
      options,
    },
  ];
}

/** Returns the model with the config value `value`, or undefined if `models` has none. */
export function modelOf(models: readonly AcpModel[], value: string): AcpModel | undefined {
  return models.find((model) => modelValue(model.provider, model.id) === value);
}
