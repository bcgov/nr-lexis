package ca.bc.gov.mof.lexis.dto.client;

/** A minimal client identity safe to show in type-ahead search results. */
public record ClientSuggestionDto(String clientNumber, String companyName, String clientAcronym) {}
