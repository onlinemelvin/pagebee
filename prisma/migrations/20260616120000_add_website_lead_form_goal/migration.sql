-- Add the owner-chosen primary CTA / lead-form goal to each website. Drives the live site's CTA
-- label, the form's submit label, and the lead `type` at serve time; editable from the Inquiries
-- page with no rebuild.
ALTER TABLE "websites" ADD COLUMN "leadFormGoal" TEXT;
