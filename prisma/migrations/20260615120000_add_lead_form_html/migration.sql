-- The bespoke lead-capture form is generated for every site, then stripped out of generatedHtml
-- into this column. The page keeps only a [data-pb-leadform-slot]; the form is injected back at
-- serve time only when the plan allows forms AND the owner has them enabled.
ALTER TABLE "website_versions" ADD COLUMN "leadFormHtml" TEXT;
