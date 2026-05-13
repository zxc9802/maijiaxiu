# Handheld Product Closeup Design

## Goal

Add a buyer-show image type for close-up hand-held product photos, matching customer review examples where a hand holds the product near the camera and the product packaging is the main subject.

## Requirements

- Add an independent image type named `handheld_product_closeup`.
- Show the new type in the suite image-type controls as `手持商品特写图`.
- Generate this type as an amateur smartphone close-up: one hand holding the product, product front label visible, tight framing, no selfie composition, no full person, no face.
- Keep the existing `selfie_holding_product` type for mirror/front-camera selfie images.
- Update `bathroom_vanity` prompts so bathroom or vanity scenes do not include people, faces, hands, arms, body parts, or mirror reflections of a person.
- Preserve saved-state compatibility by treating unknown old image types as unsupported and reading the new type when present.

## Scope

This change touches the shared image type schema, default generation-set counts, frontend image-type labels and saved-state parsing, image prompt construction, static prototype copy, and tests that assert the supported type list.

## Testing

- Schema/source tests should assert `handheld_product_closeup` is supported.
- Static prototype tests should assert the new label and `data-image-type` marker exist.
- Prompt tests should assert the new close-up prompt avoids selfie/full-person framing and the bathroom prompt excludes visible people.

## Limitations

The workspace is not a git repository, so the design cannot be committed from this directory.
