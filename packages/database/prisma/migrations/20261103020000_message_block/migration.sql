-- Amped Messages (Build Board #2 r4, PR M6, spec 8.4): the Message me block.
-- Apply by hand after 20261103010000_messages_server, once the M6 code is deployed
-- (it renders both kinds, so the order of code and SQL does not matter for visitors).
--
-- Message me on Telegram blocks become Message me blocks in place: same row, same
-- order, same label. A label still at the old default becomes the new default, since
-- the button no longer opens Telegram. Data only; no column changes.

UPDATE `blocks`
SET `config` = JSON_SET(COALESCE(`config`, '{}'), '$.label', 'Message me')
WHERE `type` = 'telegram_message'
  AND (
    `config` IS NULL
    OR JSON_UNQUOTE(JSON_EXTRACT(`config`, '$.label')) IS NULL
    OR JSON_UNQUOTE(JSON_EXTRACT(`config`, '$.label')) = 'Message me on Telegram'
  );

UPDATE `blocks`
SET `type` = 'message'
WHERE `type` = 'telegram_message';
