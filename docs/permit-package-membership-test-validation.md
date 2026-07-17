# Permit Package Membership TEST Validation

This guide validates the direct package-to-permit relationship predicate used by permit detail
endpoints. It replaces repeated full normal and Blanket OIC package-list lookups while preserving
the legacy authorization relationship.

Run these statements against **TEST** only. They are read-only and need `SELECT` access to
`EXPORT_PACKAGE`, `EXPORT_EXEMPTION_APPLICATION`, `EXPORT_PERMIT_DETAIL`, and
`EXPORT_SCALE_DETAIL`. If those tables are not available through synonyms, prefix them with the
schema name (for example, `THE.EXPORT_PACKAGE`).

## Find representative pairs

Use at least one result from each query. The normal example exercises the scale-to-permit path.
The Blanket OIC example specifically has no scale assigned to that permit, so it proves the OIC
relationship is not accidentally dropped.

```sql
-- Normal package: connected to the permit by a scale, not by its OIC application.
SELECT *
FROM (
  SELECT DISTINCT
    p.package_number,
    sd.export_permit_detail_number AS permit_number
  FROM export_package p
  JOIN export_scale_detail sd
    ON sd.package_number = p.package_number
  WHERE NOT EXISTS (
    SELECT 1
    FROM export_exemption_application eea
    JOIN export_permit_detail epd
      ON epd.oic_application_number = eea.application_number
    WHERE eea.application_number = p.application_number
      AND epd.export_permit_detail_number = sd.export_permit_detail_number
  )
  ORDER BY sd.export_permit_detail_number, p.package_number
)
WHERE ROWNUM <= 10;
```

```sql
-- Blanket OIC-only package: connected through the OIC application, with no scale for this permit.
SELECT *
FROM (
  SELECT DISTINCT
    p.package_number,
    epd.export_permit_detail_number AS permit_number
  FROM export_package p
  JOIN export_exemption_application eea
    ON eea.application_number = p.application_number
  JOIN export_permit_detail epd
    ON epd.oic_application_number = eea.application_number
  WHERE NOT EXISTS (
    SELECT 1
    FROM export_scale_detail esd
    WHERE esd.package_number = p.package_number
      AND esd.export_permit_detail_number = epd.export_permit_detail_number
  )
  ORDER BY epd.export_permit_detail_number, p.package_number
)
WHERE ROWNUM <= 10;
```

An empty Blanket OIC result means TEST has no qualifying data. Do not substitute a normal package;
use a known Blanket OIC fixture or arrange one before approving the change. The legacy procedure
does not filter on an exemption-type code, so this validation deliberately uses the OIC application
relationship rather than assuming a particular type-code convention.

## Check an individual pair

For a pair returned above, bind `:packageNumber` and `:permitNumber`. A positive count is valid;
zero is denied. This is the exact predicate used by the backend.

```sql
SELECT COUNT(*) AS relationship_count
FROM export_package p
LEFT JOIN export_exemption_application eea
  ON eea.application_number = p.application_number
LEFT JOIN export_permit_detail epd
  ON epd.oic_application_number = eea.application_number
LEFT JOIN export_scale_detail esd
  ON esd.package_number = p.package_number
WHERE p.package_number = :packageNumber
  AND (
    epd.export_permit_detail_number = :permitNumber
    OR esd.export_permit_detail_number = :permitNumber
  );
```

For a negative cross-permit case, keep a package number from either valid pair and use this query
to find a permit that is not related to it. Substitute the returned permit into the individual
predicate; it must return zero.

```sql
SELECT *
FROM (
  SELECT candidate.export_permit_detail_number AS unrelated_permit_number
  FROM export_permit_detail candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM export_package p
    LEFT JOIN export_exemption_application eea
      ON eea.application_number = p.application_number
    LEFT JOIN export_permit_detail linked_permit
      ON linked_permit.oic_application_number = eea.application_number
    LEFT JOIN export_scale_detail esd
      ON esd.package_number = p.package_number
    WHERE p.package_number = :packageNumber
      AND (
        linked_permit.export_permit_detail_number
          = candidate.export_permit_detail_number
        OR esd.export_permit_detail_number
          = candidate.export_permit_detail_number
      )
  )
  ORDER BY candidate.export_permit_detail_number
)
WHERE ROWNUM <= 10;
```

Also run the individual predicate with `:packageNumber = '__NO_SUCH_PACKAGE__'` and a known permit.
It must return zero.

## Compare the complete membership set

Replace `7000123` with each selected permit. An empty result is a pass: the direct predicate has
the same package set as the legacy service's normal-list plus OIC-list checks.

```sql
WITH
  params AS (
    SELECT CAST(7000123 AS NUMBER) AS permit_number FROM dual
  ),
  legacy_normal AS (
    SELECT DISTINCT p.package_number
    FROM export_package p
    JOIN export_scale_detail sd
      ON sd.package_number = p.package_number
    WHERE sd.export_permit_detail_number = (SELECT permit_number FROM params)
  ),
  legacy_oic AS (
    SELECT DISTINCT p.package_number
    FROM export_package p
    LEFT JOIN export_exemption_application eea
      ON eea.application_number = p.application_number
    LEFT JOIN export_permit_detail epd
      ON epd.oic_application_number = eea.application_number
    LEFT JOIN export_scale_detail esd
      ON esd.package_number = p.package_number
    WHERE epd.export_permit_detail_number = (SELECT permit_number FROM params)
       OR esd.export_permit_detail_number = (SELECT permit_number FROM params)
  ),
  legacy_union AS (
    SELECT package_number FROM legacy_normal
    UNION
    SELECT package_number FROM legacy_oic
  ),
  direct_predicate AS (
    SELECT DISTINCT p.package_number
    FROM export_package p
    LEFT JOIN export_exemption_application eea
      ON eea.application_number = p.application_number
    LEFT JOIN export_permit_detail epd
      ON epd.oic_application_number = eea.application_number
    LEFT JOIN export_scale_detail esd
      ON esd.package_number = p.package_number
    WHERE epd.export_permit_detail_number = (SELECT permit_number FROM params)
       OR esd.export_permit_detail_number = (SELECT permit_number FROM params)
  )
SELECT 'LEGACY_ONLY' AS difference, package_number
FROM (
  SELECT package_number FROM legacy_union
  MINUS
  SELECT package_number FROM direct_predicate
)
UNION ALL
SELECT 'DIRECT_ONLY' AS difference, package_number
FROM (
  SELECT package_number FROM direct_predicate
  MINUS
  SELECT package_number FROM legacy_union
)
ORDER BY difference, package_number;
```

`legacy_normal` is retained deliberately even though the current OIC procedure also includes the
scale relationship. This mirrors the old service's normal-then-OIC evaluation and protects that
behavior if the legacy procedure changes later.
