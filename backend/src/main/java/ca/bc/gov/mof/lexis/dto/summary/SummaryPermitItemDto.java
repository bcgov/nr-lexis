package ca.bc.gov.mof.lexis.dto.summary;

import java.time.LocalDate;

public record SummaryPermitItemDto(
    Long permit,
    String status,
    String ownerClientNumber,
    String agentClientNumber,
    String exemption,
    long totalPieces,
    double totalVolume,
    String receipt,
    LocalDate issueDate) {}
