package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitCountryListRpcResponseDto(List<PermitCountryItemRpcResponseDto> countryList) {}
