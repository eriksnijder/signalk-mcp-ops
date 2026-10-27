# MCP Operations icon

The icon combines a speech bubble, connected data points and a wave. It represents asking questions about marine instrument data. No third-party logo was used.

Created with the built-in image generation tool. The chosen generated source is retained as `icon-source.png` in this directory. `../icon.png` is the application export: its PNG image data was recompressed losslessly to fit Signal K's 1 MiB icon cache limit. Dimensions and decoded pixel data are unchanged. The original generated file is preserved separately.

The application export is declared as `signalk.appIcon: "./icon.png"` and included explicitly in the npm package. The source and these design notes are repository-only.

## Initial prompt

Use case: logo-brand. Create a finished square application icon for a nautical Signal K MCP operations and diagnostics plugin. A single distinctive bold emblem combining a clean white speech bubble with a turquoise signal waveform that subtly reads as a sea wave; three simple connected data points suggest a connection between boat instruments and an AI assistant. Deep navy full-bleed square background with a restrained subtle blue tonal gradient, crisp flat graphic shapes, generous negative space, excellent contrast, polished professional marine software identity. Emblem centered with 15 percent padding, recognizable at 48px. No text, letters, boat names, logos from other companies, robot faces, mockup, border, external shadow, or decorative tiny detail. Deliver one 1024 by 1024 PNG icon, opaque background.

## Final edit prompt

Edit this app icon for production use in the Signal K App Store. Preserve exactly the existing speech bubble, connected three data points, wave motif, placement and proportions. Flatten the palette completely: background must be one perfectly uniform solid deep navy #08264A; bubble one solid white; wave and points one solid turquoise #12C9DA. Absolutely no gradients, grain, texture, shadows, lighting, dithering, or extra colors except edge antialiasing. Crisp professional flat graphic. Output a square 512x512 PNG if supported. No text. This asset must be compact and legible at 48px.

The generator returned 1254×1254 pixels; this size is retained in the export. The README displays it at 96×96, and Signal K sizes it in the App Store UI.
