-- Migration: Add language_code to countries
-- Description: Stores ISO 639-1 language code for translation support

ALTER TABLE countries ADD COLUMN IF NOT EXISTS language_code VARCHAR(5);

UPDATE countries SET language_code = CASE code
  WHEN 'TR' THEN 'tr'
  WHEN 'ME' THEN 'sr'
  WHEN 'ES' THEN 'es'
  WHEN 'UZ' THEN 'uz'
  WHEN 'UA' THEN 'uk'
  WHEN 'KZ' THEN 'ru'
  WHEN 'DE' THEN 'de'
  WHEN 'MY' THEN 'ms'
  WHEN 'AL' THEN 'sq'
  WHEN 'AT' THEN 'de'
  WHEN 'RU' THEN 'ru'
  WHEN 'VN' THEN 'vi'
  WHEN 'RO' THEN 'ro'
  WHEN 'IT' THEN 'it'
END;

COMMENT ON COLUMN countries.language_code IS 'ISO 639-1 language code for product name translation';
