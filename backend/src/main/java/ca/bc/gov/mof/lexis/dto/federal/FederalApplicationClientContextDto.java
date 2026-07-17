package ca.bc.gov.mof.lexis.dto.federal;

public record FederalApplicationClientContextDto(
    String address,
    String city,
    String province,
    String postalCode,
    String country,
    String phone,
    String fax,
    String email) {}
