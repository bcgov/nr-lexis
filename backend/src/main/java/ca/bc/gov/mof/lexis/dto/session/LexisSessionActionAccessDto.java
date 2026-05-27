package ca.bc.gov.mof.lexis.dto.session;

import java.util.List;

public record LexisSessionActionAccessDto(
    boolean authenticated,
    String principal,
    List<String> roles,
    String action,
    boolean granted) {}
