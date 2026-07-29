package ca.bc.gov.mof.lexis.dto.session;

import jakarta.validation.constraints.Pattern;

public record UpdateLexisUserPreferencesDto(
    @Pattern(
            regexp = "RCO|RNI|RSI",
            message = "Default region must be one of RCO, RNI, or RSI.")
        String defaultRegion) {}
