package ca.bc.gov.mof.lexis.dto.rtm;

import java.time.LocalDateTime;

/** Latest durable audit metadata for one AMV effective month. */
public record RtmEmsLogAmvLastSavedDto(String savedBy, LocalDateTime savedAt) {}
