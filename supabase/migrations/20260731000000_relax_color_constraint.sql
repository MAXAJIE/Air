-- Relax the color check constraint on property_statuses to allow hex colours.
-- The original constraint only allowed the 6 named palette keys. The UI colour
-- wheel sends hex values (e.g. #ff0000), which the constraint rejected,
-- causing a "Something went wrong" toast.

ALTER TABLE public.property_statuses DROP CONSTRAINT IF EXISTS property_statuses_color_check;
ALTER TABLE public.property_statuses
  ADD CONSTRAINT property_statuses_color_check
  CHECK (
    color IN ('slate','blue','green','amber','rose','violet')
    OR color ~ '^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$'
  );
