package ca.bc.gov.mof.lexis.dto.session;

import java.util.List;

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
    String orgUnitNo) {}
