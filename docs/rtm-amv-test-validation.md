# RTM AMV TEST Validation

Use this checklist after the RTM branch is deployed to a non-production environment. It validates
the active one-table implementation, where old growth and second growth are `O` and `S` partitions
of `THE.EMS_LOG_AMV`.

Do not commit real TEST permit numbers, client data, effective months, or market values to this
repository. Choose a controlled, unused effective month and values with the RTM data owner.

## Preconditions

- Use a user with the RTM AMV administration authority.
- Use a TEST or pull-request preview deployment, never production.
- Record the chosen `:effective_month`, `:grade`, and values outside the repository.
- Confirm whether the data owner considers `O` and `S` partitions to satisfy the Confluence
  old-growth/second-growth terminology before accepting FR-01.

## UI and persistence acceptance

1. Open `/admin/rtm/emslogamv` and confirm there is one table, no growth selector, and no `W` or
   blank grade row.
2. Enter a controlled value for one simple species (for example, Balsam) and one Pine value for
   the same effective month. Save once and confirm the success message refers to old and second
   growth together.
3. Reopen the month and confirm the displayed values are the old-growth (`O`) baseline.
4. Run the read-only queries below. The simple species must have one `O` and one `S` row; Pine
   must have `WH`, `LO`, and `YE` for both growth values.
5. Check the backend pod log for one `event=lexis_rtm_amv_batch` event with the authenticated
   actor, server timestamp, success status, logical-cell count, and physical-row count.

### Simple-species partition query

Bind `:effective_month` as `YYYY-MM-DD`, `:species` to the simple backend code, and `:grade` to
the saved grade. The result must contain exactly the `O` and `S` rows with the controlled value.

```sql
SELECT
  growth_type_st,
  species,
  grade,
  effective_date,
  avg_market_price,
  revision_count
FROM the.ems_log_amv
WHERE species = UPPER(:species)
  AND grade = UPPER(:grade)
  AND effective_date >= TO_DATE(:effective_month, 'YYYY-MM-DD')
  AND effective_date < TO_DATE(:effective_month, 'YYYY-MM-DD') + 1
ORDER BY growth_type_st;
```

### Pine fan-out query

This must return six rows: `WH`, `LO`, and `YE` for each of `O` and `S`.

```sql
SELECT
  growth_type_st,
  species,
  grade,
  effective_date,
  avg_market_price
FROM the.ems_log_amv
WHERE species IN ('WH', 'LO', 'YE')
  AND grade = UPPER(:grade)
  AND effective_date >= TO_DATE(:effective_month, 'YYYY-MM-DD')
  AND effective_date < TO_DATE(:effective_month, 'YYYY-MM-DD') + 1
ORDER BY growth_type_st, species;
```

### Export-trigger query

`SYNC_EMSLA_EXPLA` must mirror the same rows to `EXPORT_LOG_AMV`.

```sql
SELECT
  export_growth_type_code,
  export_species_code,
  export_grade_code,
  effective_date,
  average_market_price,
  revision_count
FROM the.export_log_amv
WHERE export_species_code IN (UPPER(:species), 'WH', 'LO', 'YE')
  AND export_grade_code = UPPER(:grade)
  AND effective_date >= TO_DATE(:effective_month, 'YYYY-MM-DD')
  AND effective_date < TO_DATE(:effective_month, 'YYYY-MM-DD') + 1
ORDER BY export_growth_type_code, export_species_code;
```

Do not deliberately create a database failure in shared TEST to prove rollback. The focused
service/repository tests cover transaction rollback; a data owner should approve any destructive
integration test.

## Downstream-consumer acceptance

With the data owner, exercise the consumers that use AMV data after the controlled save:

- LEXIS AMV lookup and fee-in-lieu calculation.
- The affected reporting path.
- Any EMSA43 or integration process identified by the RTM owner.

Record the selected consumers, their inputs, and the expected result in the deployment evidence.
FR-21 is not complete until this acceptance is recorded.

## Permit-load timing acceptance

Use browser DevTools with cache disabled and capture three cold navigations to one representative
permit. Record the timing waterfall for:

- `/lexis/permits/{permitNumber}` and its exemption context.
- `/lexis/rpc/permit-details/core-tabs`.
- `/lexis/rpc/permit-details/edit-context` for editors.

On the default Permit tab, there must be no request for
`/lexis/rpc/application-details/client-data` or
`/lexis/rpc/permit-details/available-application-list`. Opening Owner or Agent may load client
data; focusing Available application may load candidate applications. Compare the median cold-load
time to the baseline captured before this branch is deployed.
