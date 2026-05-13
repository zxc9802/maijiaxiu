# Suite Ethnicity Design

## Goal

Each buyer-show generation suite can choose a human ethnicity/race appearance option. The default is yellow/Asian, and the choice affects texture-on-hand images and real-person selfie images.

## Scope

- Add a suite-level option with three values: yellow/Asian, white/Caucasian, black/Black.
- Default every new, default, and migrated suite to yellow/Asian.
- Include the selected option in generate and regenerate image requests.
- Preserve save/load behavior.
- Make image prompts describe matching skin tone and visible-person appearance for texture-on-hand and selfie-holding-product images.
- Apply the same choice lightly to bathroom/vanity images when hands or people appear.

## UI

The control lives in each suite card in the configuration section. It uses a compact segmented/radio-style selector labeled "人种", with options "黄种人", "白种人", and "黑种人".

## Data Model

`GenerationSet` gets `personEthnicity`. The value is parsed by Zod and defaults to `yellow`. Saved state parsing also defaults old suite data to `yellow`.

## Prompt Behavior

The generation service maps each enum value to concrete prompt guidance. The guidance avoids changing product claims or comment content; it only changes the visible customer/skin appearance in generated images.

## Testing

Source-level node tests assert:

- the schema exports and defaults the new enum;
- the client renders the suite-level choices and sends/saves the field;
- the prompt builder includes ethnicity guidance;
- regeneration uses the same prompt builder instead of a minimal separate prompt.

