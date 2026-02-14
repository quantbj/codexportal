/**
 * Builds a schema-driven form UI for contract parameters.
 */
export async function initContractParametersUI({ formRootId, statusId, previewId, schemaUrl = "./contract.json", initialValue = {} }) {
  const formRoot = document.getElementById(formRootId);
  const status = document.getElementById(statusId);
  const preview = document.getElementById(previewId);

  if (!formRoot || !status || !preview) {
    return { getValue: () => ({}) };
  }

  try {
    const response = await fetch(schemaUrl);
    if (!response.ok) {
      throw new Error(`Schema konnte nicht geladen werden (HTTP ${response.status})`);
    }

    const schema = await response.json();
    const rootNode = renderRootForm(schema, formRoot, preview, initialValue);
    status.textContent = "Vertragsschema geladen.";

    // Initial preview output for easier review.
    updatePreview(rootNode, preview);

    return {
      getValue: () => rootNode.getValue() || {}
    };
  } catch (error) {
    status.textContent = `Fehler beim Laden des Schemas: ${error.message}`;
    status.classList.add("contract-status-error");
    return { getValue: () => ({}) };
  }
}

/**
 * Renders the top-level schema sections as collapsible cards.
 */
function renderRootForm(schema, container, preview, initialValue) {
  const sections = [];
  const topProperties = schema.properties || {};

  for (const [name, propertySchema] of Object.entries(topProperties)) {
    const details = document.createElement("div");
    details.className = "schema-section";
    const body = document.createElement("div");
    body.className = "schema-section-body";
    details.appendChild(body);

    const node = renderNode({
      key: name,
      schema: propertySchema,
      rootSchema: schema,
      required: false,
      path: name,
      initialValue: initialValue?.[name],
      onChange: () => updatePreview(rootNodeApi, preview)
    });

    body.appendChild(node.element);
    sections.push({ key: name, node });
    container.appendChild(details);
  }

  const rootNodeApi = {
    getValue() {
      const output = {};
      for (const section of sections) {
        const value = section.node.getValue();
        if (value !== undefined) {
          output[section.key] = value;
        }
      }
      return output;
    }
  };

  return rootNodeApi;
}

/**
 * Renders one schema node recursively.
 */
function renderNode({ key, schema, rootSchema, required, path, onChange, initialValue }) {
  const resolvedSchema = resolveSchema(schema, rootSchema);

  if (resolvedSchema.type === "object" || resolvedSchema.properties) {
    return renderObjectNode({ key, schema: resolvedSchema, rootSchema, required, path, onChange, initialValue });
  }

  if (resolvedSchema.type === "array") {
    return renderArrayNode({ key, schema: resolvedSchema, rootSchema, required, path, onChange, initialValue });
  }

  return renderScalarNode({ key, schema: resolvedSchema, required, path, onChange, initialValue });
}

/**
 * Renders object fields as a grouped card.
 */
function renderObjectNode({ key, schema, rootSchema, required, path, onChange, initialValue }) {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "schema-group";
  let visible = true;
  let dynamicRequired = false;

  if (schema.description) {
    const description = document.createElement("p");
    description.className = "schema-help";
    description.textContent = toDisplayDescription(schema.description);
    wrapper.appendChild(description);
  }

  const children = [];
  const childrenByKey = new Map();
  const requiredKeys = new Set(schema.required || []);

  for (const [childKey, childSchema] of Object.entries(schema.properties || {})) {
    const handleChildChange = () => {
      applyConditionalRules();
      onChange();
    };

    const child = renderNode({
      key: childKey,
      schema: childSchema,
      rootSchema,
      required: requiredKeys.has(childKey),
      path: `${path}.${childKey}`,
      initialValue: initialValue?.[childKey],
      onChange: handleChildChange
    });

    wrapper.appendChild(child.element);
    const entry = { key: childKey, child, required: requiredKeys.has(childKey), dynamicRequired: false };
    children.push(entry);
    childrenByKey.set(childKey, entry);
  }

  const conditionalRules = collectConditionalRules(schema);
  applyConditionalRules();

  return {
    element: wrapper,
    setVisible(nextVisible) {
      visible = nextVisible;
      wrapper.classList.toggle("schema-hidden", !nextVisible);
    },
    setRequired(nextRequired) {
      dynamicRequired = nextRequired;
    },
    getValue() {
      if (!visible) {
        return undefined;
      }

      const output = {};

      for (const entry of children) {
        const value = entry.child.getValue();
        if (value !== undefined) {
          output[entry.key] = value;
        }
      }

      if (Object.keys(output).length === 0 && !isRequired()) {
        return undefined;
      }

      return output;
    }
  };

  function isRequired() {
    return required || dynamicRequired;
  }

  function applyConditionalRules() {
    if (conditionalRules.length === 0) {
      return;
    }

    const currentValue = getCurrentObjectValue();
    const conditionalTargets = new Set();
    const activeVisibility = new Map();
    const activeRequired = new Map();

    for (const rule of conditionalRules) {
      if (rule.type === "ifThenRequired") {
        for (const target of rule.targets) {
          conditionalTargets.add(target);
        }
      }
    }

    for (const target of conditionalTargets) {
      activeVisibility.set(target, false);
    }

    for (const rule of conditionalRules) {
      if (rule.type === "ifThenRequired") {
        const matched = evaluateIfCondition(rule.ifSchema, currentValue);
        for (const target of rule.targets) {
          if (matched) {
            activeVisibility.set(target, true);
            activeRequired.set(target, true);
          }
        }
      }

      if (rule.type === "dependentRequired") {
        if (hasValue(currentValue[rule.trigger])) {
          for (const target of rule.targets) {
            activeRequired.set(target, true);
          }
        }
      }
    }

    for (const entry of children) {
      const visibilityRuleDefined = conditionalTargets.has(entry.key);
      const shouldBeVisible = visibilityRuleDefined ? activeVisibility.get(entry.key) === true : true;
      entry.child.setVisible?.(shouldBeVisible);

      entry.dynamicRequired = activeRequired.get(entry.key) === true;
      entry.child.setRequired?.(entry.dynamicRequired);
    }
  }

  function getCurrentObjectValue() {
    const output = {};
    for (const entry of children) {
      const value = entry.child.getValue();
      if (value !== undefined) {
        output[entry.key] = value;
      }
    }
    return output;
  }
}

/**
 * Renders arrays with add/remove item controls.
 */
function renderArrayNode({ key, schema, rootSchema, required, path, onChange, initialValue }) {
  const wrapper = document.createElement("div");
  wrapper.className = "schema-array";
  let visible = true;
  let dynamicRequired = false;

  const title = document.createElement("p");
  title.className = "schema-array-title";
  const titleBaseText = toGermanLabel(key);
  title.textContent = titleBaseText + (required ? " *" : "");
  wrapper.appendChild(title);

  if (schema.description) {
    const description = document.createElement("p");
    description.className = "schema-help";
    description.textContent = toDisplayDescription(schema.description);
    wrapper.appendChild(description);
  }

  const itemsContainer = document.createElement("div");
  itemsContainer.className = "schema-array-items";
  wrapper.appendChild(itemsContainer);

  const entries = [];

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "schema-array-add";
  addButton.textContent = "Eintrag hinzufügen";
  addButton.addEventListener("click", () => {
    addItem();
    onChange();
  });
  wrapper.appendChild(addButton);

  const initialItems = Array.isArray(initialValue) ? initialValue : [];
  const minItems = Number.isInteger(schema.minItems) ? schema.minItems : 0;
  const initialCount = Math.max(minItems, initialItems.length || 1);
  for (let i = 0; i < initialCount; i += 1) {
    addItem(initialItems[i]);
  }

  function addItem(itemInitialValue) {
    const itemIndex = entries.length;
    const card = document.createElement("div");
    card.className = "schema-array-item";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "schema-array-remove";
    removeButton.textContent = "Entfernen";

    const node = renderNode({
      key: "",
      schema: schema.items || {},
      rootSchema,
      required: false,
      path: `${path}[${itemIndex}]`,
      initialValue: itemInitialValue,
      onChange
    });

    removeButton.addEventListener("click", () => {
      const activeEntries = entries.filter((entry) => entry.active);
      if (activeEntries.length <= minItems) {
        return;
      }

      entry.active = false;
      card.remove();
      onChange();
    });

    card.appendChild(removeButton);
    card.appendChild(node.element);
    itemsContainer.appendChild(card);

    const entry = { node, active: true };
    entries.push(entry);
  }

  return {
    element: wrapper,
    setVisible(nextVisible) {
      visible = nextVisible;
      wrapper.classList.toggle("schema-hidden", !nextVisible);
    },
    setRequired(nextRequired) {
      dynamicRequired = nextRequired;
      title.textContent = titleBaseText + ((required || dynamicRequired) ? " *" : "");
    },
    getValue() {
      if (!visible) {
        return undefined;
      }

      const values = entries
        .filter((entry) => entry.active)
        .map((entry) => entry.node.getValue())
        .filter((value) => value !== undefined);

      if (values.length === 0 && !(required || dynamicRequired)) {
        return undefined;
      }

      return values;
    }
  };
}

/**
 * Renders scalar nodes (string, number, boolean, enum).
 */
function renderScalarNode({ key, schema, required, path, onChange, initialValue }) {
  const wrapper = document.createElement("label");
  wrapper.className = "schema-field";
  let visible = true;
  let dynamicRequired = false;

  const title = document.createElement("span");
  title.className = "schema-label";
  const titleBaseText = toGermanLabel(key || path.split(".").pop());
  title.textContent = titleBaseText + (required ? " *" : "");
  wrapper.appendChild(title);

  const input = createInput(schema, required);
  input.dataset.path = path;
  input.addEventListener("input", onChange);
  input.addEventListener("change", onChange);
  wrapper.appendChild(input);
  applyInitialValue(input, schema, initialValue);

  if (schema.description || schema.$comment) {
    const help = document.createElement("small");
    help.className = "schema-help";
    const parts = [];
    if (schema.description) {
      parts.push(toDisplayDescription(schema.description));
    }
    if (schema.$comment) {
      parts.push(schema.$comment);
    }
    help.textContent = parts.join(" ");
    wrapper.appendChild(help);
  }

  return {
    element: wrapper,
    setVisible(nextVisible) {
      visible = nextVisible;
      wrapper.classList.toggle("schema-hidden", !nextVisible);
    },
    setRequired(nextRequired) {
      dynamicRequired = nextRequired;
      title.textContent = titleBaseText + ((required || dynamicRequired) ? " *" : "");
    },
    getValue() {
      if (!visible) {
        return undefined;
      }

      if (input.tagName === "SELECT" && schema.type === "boolean") {
        if (input.value === "") {
          return (required || dynamicRequired) ? false : undefined;
        }
        return input.value === "true";
      }

      if (schema.type === "number" || schema.type === "integer") {
        if (input.value === "") {
          return (required || dynamicRequired) ? 0 : undefined;
        }

        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
          return (required || dynamicRequired) ? 0 : undefined;
        }

        return schema.type === "integer" ? Math.round(parsed) : parsed;
      }

      const value = input.value.trim();
      if (value === "") {
        return (required || dynamicRequired) ? "" : undefined;
      }

      return value;
    }
  };
}

/**
 * Applies an initial value to a scalar form input.
 */
function applyInitialValue(input, schema, initialValue) {
  if (initialValue === undefined || initialValue === null) {
    return;
  }

  if (schema.type === "boolean" && input.tagName === "SELECT") {
    input.value = String(Boolean(initialValue));
    return;
  }

  input.value = String(initialValue);
}

/**
 * Collects simple conditional rules from schema-level keywords.
 */
function collectConditionalRules(schema) {
  const rules = [];

  if (schema.if && schema.then?.required) {
    rules.push({
      type: "ifThenRequired",
      ifSchema: schema.if,
      targets: schema.then.required
    });
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) {
      if (branch.if && branch.then?.required) {
        rules.push({
          type: "ifThenRequired",
          ifSchema: branch.if,
          targets: branch.then.required
        });
      }
    }
  }

  if (schema.dependentRequired) {
    for (const [trigger, targets] of Object.entries(schema.dependentRequired)) {
      rules.push({
        type: "dependentRequired",
        trigger,
        targets: Array.isArray(targets) ? targets : []
      });
    }
  }

  return rules;
}

/**
 * Evaluates a simplified JSON-Schema if-condition against object values.
 */
function evaluateIfCondition(ifSchema, currentValue) {
  if (!ifSchema || typeof ifSchema !== "object") {
    return false;
  }

  for (const requiredKey of ifSchema.required || []) {
    if (!hasValue(currentValue[requiredKey])) {
      return false;
    }
  }

  for (const [propertyKey, propertyRule] of Object.entries(ifSchema.properties || {})) {
    const value = currentValue[propertyKey];

    if (propertyRule.const !== undefined && value !== propertyRule.const) {
      return false;
    }

    if (Array.isArray(propertyRule.enum) && !propertyRule.enum.includes(value)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether a field should count as set in conditional evaluation.
 */
function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Creates the best available HTML input based on schema hints.
 */
function createInput(schema, required) {
  if (Array.isArray(schema.enum)) {
    const select = document.createElement("select");
    if (!required) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Bitte wählen";
      select.appendChild(empty);
    }

    for (const value of schema.enum) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      select.appendChild(option);
    }

    return select;
  }

  if (schema.type === "boolean") {
    const select = document.createElement("select");

    if (!required) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Bitte wählen";
      select.appendChild(empty);
    }

    const yes = document.createElement("option");
    yes.value = "true";
    yes.textContent = "Ja";

    const no = document.createElement("option");
    no.value = "false";
    no.textContent = "Nein";

    select.appendChild(yes);
    select.appendChild(no);
    return select;
  }

  const input = document.createElement("input");

  if (schema.type === "number" || schema.type === "integer") {
    input.type = "number";
    input.step = schema.type === "integer" ? "1" : "any";
    if (schema.minimum !== undefined) {
      input.min = String(schema.minimum);
    }
    if (schema.maximum !== undefined) {
      input.max = String(schema.maximum);
    }
  } else if (schema.format === "email") {
    input.type = "email";
  } else if (schema.format === "date") {
    input.type = "date";
  } else {
    input.type = "text";
  }

  if (schema.pattern) {
    input.pattern = schema.pattern;
  }

  return input;
}

/**
 * Resolves local $ref pointers from the schema.
 */
function resolveSchema(schema, rootSchema) {
  if (!schema) {
    return {};
  }

  if (schema.$ref && schema.$ref.startsWith("#/$defs/")) {
    const refKey = schema.$ref.replace("#/$defs/", "");
    const resolved = rootSchema.$defs?.[refKey] || {};
    const { $ref, ...inlineProps } = schema;
    return { ...resolved, ...inlineProps };
  }

  return schema;
}

/**
 * Updates JSON preview with current values.
 */
function updatePreview(rootNode, preview) {
  const value = rootNode.getValue() || {};
  preview.textContent = JSON.stringify(value, null, 2);
}

/**
 * Turns schema keys into readable labels.
 */
function toGermanLabel(value) {
  return String(value || "Feld")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Uses the German part of bilingual descriptions when available.
 */
function toDisplayDescription(text) {
  if (!text.includes("/")) {
    return text;
  }

  return text.split("/")[0].trim();
}
