CREATE OR REPLACE FUNCTION voike_shadow_write() RETURNS trigger AS $$
DECLARE
  voike_url text := current_setting('voike.api_url', true);
  voike_key text := current_setting('voike.api_key', true);
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)
  );
  PERFORM http_post(
    voike_url || '/ingest/file',
    payload::text,
    ARRAY[http_header('content-type', 'application/json'), http_header('x-voike-api-key', voike_key)]
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_notify('voike_shadow', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voike_shadow_trigger
AFTER INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE PROCEDURE voike_shadow_write();
