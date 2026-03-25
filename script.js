(() => {
  const root = document.documentElement;
  root.classList.add("js");

  const STORAGE_KEY = "site-animation-preset";
  const REPLAY_STORAGE_KEY = "site-animation-replay-enabled";
  const COLOR_STORAGE_KEY = "site-color-overrides";
  const DEFAULT_PRESET = "rise";
  const VALID_PRESETS = new Set([
    "rise",
    "slide-left",
    "zoom",
    "soft-blur",
    "none",
  ]);

  const presetSelect = document.querySelector("#animationPreset");
  const revealToggle = document.querySelector("#revealToggle");
  const paletteReset = document.querySelector("#paletteReset");
  const colorPickers = Array.from(
    document.querySelectorAll(".palette-picker[data-color-var]")
  );
  const revealSelectors = [
    ".hero .eyebrow",
    ".hero h1",
    ".hero .lead",
    ".hero .cta-row",
    ".hero .feature-card",
    ".section-title-wrap",
    ".audience-card",
    ".info-item",
    ".program-card",
    ".host-card",
    ".faq-item",
    ".bottom-cta",
  ];

  const revealItems = Array.from(
    document.querySelectorAll(revealSelectors.join(","))
  );

  let observer = null;
  let replayEnabled = true;
  const defaultPalette = {};

  const normalizePreset = (value) =>
    VALID_PRESETS.has(value) ? value : DEFAULT_PRESET;

  const normalizeHexColor = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }

    if (/^#[0-9a-f]{6}$/.test(trimmed)) {
      return trimmed;
    }

    const shortHexMatch = trimmed.match(/^#([0-9a-f]{3})$/);
    if (shortHexMatch) {
      return `#${shortHexMatch[1]
        .split("")
        .map((chunk) => `${chunk}${chunk}`)
        .join("")}`;
    }

    const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/);
    if (!rgbMatch) {
      return null;
    }

    const parts = rgbMatch[1]
      .split(",")
      .slice(0, 3)
      .map((part) => Number.parseInt(part.trim(), 10));
    const isValidRgb = parts.length === 3 && parts.every((part) => (
      Number.isInteger(part) && part >= 0 && part <= 255
    ));

    if (!isValidRgb) {
      return null;
    }

    return `#${parts
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("")}`;
  };

  const hexToRgb = (hexColor) => {
    const normalized = normalizeHexColor(hexColor);
    if (!normalized) {
      return null;
    }

    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    };
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;

  const mixHexColors = (baseColor, targetColor, targetWeight) => {
    const base = hexToRgb(baseColor);
    const target = hexToRgb(targetColor);
    if (!base || !target) {
      return null;
    }

    const clampedWeight = Math.min(1, Math.max(0, targetWeight));
    const baseWeight = 1 - clampedWeight;

    return rgbToHex({
      r: (base.r * baseWeight) + (target.r * clampedWeight),
      g: (base.g * baseWeight) + (target.g * clampedWeight),
      b: (base.b * baseWeight) + (target.b * clampedWeight),
    });
  };

  const readStoredPreset = () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const readStoredReplayMode = () => {
    try {
      return localStorage.getItem(REPLAY_STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const readStoredPalette = () => {
    try {
      const rawValue = localStorage.getItem(COLOR_STORAGE_KEY);
      if (!rawValue) {
        return {};
      }

      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      return parsed;
    } catch {
      return {};
    }
  };

  const storePreset = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore storage errors */
    }
  };

  const storeReplayMode = (isEnabled) => {
    try {
      localStorage.setItem(REPLAY_STORAGE_KEY, isEnabled ? "on" : "off");
    } catch {
      /* ignore storage errors */
    }
  };

  const storePalette = (palette) => {
    try {
      if (!Object.keys(palette).length) {
        localStorage.removeItem(COLOR_STORAGE_KEY);
        return;
      }

      localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(palette));
    } catch {
      /* ignore storage errors */
    }
  };

  const disconnectObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const updateToggleButton = () => {
    if (!revealToggle) {
      return;
    }

    revealToggle.textContent = replayEnabled ? "Повтор: ВКЛ" : "Повтор: ВЫКЛ";
    revealToggle.classList.toggle("is-off", !replayEnabled);
    revealToggle.setAttribute("aria-pressed", String(replayEnabled));
  };

  const syncLinkedPalette = () => {
    const computedStyle = getComputedStyle(root);
    const bg = normalizeHexColor(computedStyle.getPropertyValue("--bg"));
    const card = normalizeHexColor(
      computedStyle.getPropertyValue("--card-solid")
    );
    const accent = normalizeHexColor(computedStyle.getPropertyValue("--accent"));
    const text = normalizeHexColor(computedStyle.getPropertyValue("--text"));
    const line = normalizeHexColor(computedStyle.getPropertyValue("--line"));

    if (!bg || !card || !accent || !text || !line) {
      return;
    }

    root.style.setProperty("--bg-soft", mixHexColors(bg, accent, 0.08));
    root.style.setProperty("--bg-warm", mixHexColors(bg, accent, 0.2));
    root.style.setProperty("--accent-soft", mixHexColors(accent, card, 0.75));
    root.style.setProperty("--text-soft", mixHexColors(text, card, 0.2));
    root.style.setProperty("--line-soft", mixHexColors(line, card, 0.4));
  };

  const captureDefaultPalette = () => {
    if (!colorPickers.length) {
      return;
    }

    const computedStyle = getComputedStyle(root);
    colorPickers.forEach((picker) => {
      const variableName = picker.dataset.colorVar;
      if (!variableName) {
        return;
      }

      const variableValue = normalizeHexColor(
        computedStyle.getPropertyValue(variableName)
      );
      if (!variableValue) {
        return;
      }

      defaultPalette[variableName] = variableValue;
      picker.value = variableValue;
    });
  };

  const buildPaletteOverrides = () => {
    const overrides = {};

    colorPickers.forEach((picker) => {
      const variableName = picker.dataset.colorVar;
      if (!variableName || !defaultPalette[variableName]) {
        return;
      }

      const pickerValue = normalizeHexColor(picker.value);
      if (!pickerValue) {
        return;
      }

      if (pickerValue !== defaultPalette[variableName]) {
        overrides[variableName] = pickerValue;
      }
    });

    return overrides;
  };

  const applyPalette = (palette) => {
    colorPickers.forEach((picker) => {
      const variableName = picker.dataset.colorVar;
      if (!variableName) {
        return;
      }

      const fallbackValue = defaultPalette[variableName];
      const storedValue = normalizeHexColor(palette[variableName]);
      const nextValue = storedValue || fallbackValue;
      if (!nextValue) {
        return;
      }

      root.style.setProperty(variableName, nextValue);
      if (picker.value !== nextValue) {
        picker.value = nextValue;
      }
    });

    syncLinkedPalette();
  };

  const runReveal = () => {
    if (!revealItems.length) {
      return;
    }

    disconnectObserver();

    revealItems.forEach((element, index) => {
      element.classList.add("reveal");
      element.classList.remove("is-visible");
      const delayMs = (index % 6) * 70;
      element.style.setProperty("--reveal-delay", `${delayMs}ms`);
    });

    const preset = root.dataset.anim || DEFAULT_PRESET;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const canObserve = "IntersectionObserver" in window;

    if (
      preset === "none" ||
      prefersReducedMotion ||
      !canObserve
    ) {
      revealItems.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    if (replayEnabled) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            entry.target.classList.toggle("is-visible", entry.isIntersecting);
          });
        },
        {
          threshold: 0.2,
          rootMargin: "0px 0px -10% 0px",
        }
      );
    } else {
      observer = new IntersectionObserver(
        (entries, currentObserver) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            entry.target.classList.add("is-visible");
            currentObserver.unobserve(entry.target);
          });
        },
        {
          threshold: 0.2,
          rootMargin: "0px 0px -10% 0px",
        }
      );
    }

    revealItems.forEach((element) => observer.observe(element));
  };

  const setPreset = (rawPreset, shouldStore) => {
    const preset = normalizePreset(rawPreset);
    root.dataset.anim = preset;

    if (presetSelect && presetSelect.value !== preset) {
      presetSelect.value = preset;
    }

    if (shouldStore) {
      storePreset(preset);
    }

    runReveal();
  };

  const setReplayMode = (isEnabled, shouldStore) => {
    replayEnabled = Boolean(isEnabled);
    updateToggleButton();

    if (shouldStore) {
      storeReplayMode(replayEnabled);
    }

    runReveal();
  };

  const initialPreset = normalizePreset(readStoredPreset());
  const storedReplayMode = readStoredReplayMode();
  const initialReplayEnabled = storedReplayMode !== "off";

  captureDefaultPalette();
  applyPalette(readStoredPalette());
  setPreset(initialPreset, false);
  setReplayMode(initialReplayEnabled, false);

  if (presetSelect) {
    presetSelect.addEventListener("change", (event) => {
      const nextPreset = event.target.value;
      setPreset(nextPreset, true);
    });
  }

  if (revealToggle) {
    revealToggle.addEventListener("click", () => {
      setReplayMode(!replayEnabled, true);
    });
  }

  colorPickers.forEach((picker) => {
    picker.addEventListener("input", (event) => {
      const variableName = event.target.dataset.colorVar;
      const nextColor = normalizeHexColor(event.target.value);
      if (!variableName || !nextColor) {
        return;
      }

      root.style.setProperty(variableName, nextColor);
      syncLinkedPalette();
      storePalette(buildPaletteOverrides());
    });
  });

  if (paletteReset) {
    paletteReset.addEventListener("click", () => {
      applyPalette({});
      storePalette({});
    });
  }

  window.addEventListener("beforeunload", () => {
    disconnectObserver();
  });
})();
