package ca.bc.gov.mof.lexis.dto.application;

import java.time.Instant;

public record ApplicationEditLockDto(
    boolean locked,
    boolean heldByCurrentUser,
    String lockedBy,
    String message,
    Instant expiresAt) {}
