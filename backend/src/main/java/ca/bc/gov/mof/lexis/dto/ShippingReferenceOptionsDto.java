package ca.bc.gov.mof.lexis.dto;

import java.util.List;

public record ShippingReferenceOptionsDto(
    List<CodeNameDto> countries,
    List<CodeNameDto> transportTypes,
    List<CodeNameDto> ports) {}
