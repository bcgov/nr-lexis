package ca.bc.gov.mof.lexis.dto.session;

import java.util.List;
import java.util.Map;

public record LexisSessionCapabilitiesDto(
    boolean authenticated,
    String principal,
    List<String> roles,
    String welcomeTarget,
    String legacyPath,
    List<String> grantedActions,
    String forestClientNumber,
    List<String> availableForestClientNumbers,
    boolean forestClientSelectionRequired,
    String orgUnitNo,
    // Region-limited granted actions only; an absent action is province-wide.
    Map<String, List<Long>> actionRegions) {}
