package ca.bc.gov.mof.lexis.dto.session;

import java.util.List;

public record LexisSessionWelcomeDto(
    boolean authenticated,
    String principal,
    List<String> roles,
    String welcomeTarget,
    String legacyPath) {}
