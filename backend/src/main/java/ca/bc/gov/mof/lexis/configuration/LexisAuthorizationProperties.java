package ca.bc.gov.mof.lexis.configuration;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lexis.authz")
public class LexisAuthorizationProperties {

  private Map<String, List<String>> roleActions = new LinkedHashMap<>();
  private Map<String, List<String>> scopeActions = new LinkedHashMap<>();

  public Map<String, List<String>> getRoleActions() {
    return roleActions;
  }

  public void setRoleActions(Map<String, List<String>> roleActions) {
    this.roleActions = roleActions;
  }

  public Map<String, List<String>> getScopeActions() {
    return scopeActions;
  }

  public void setScopeActions(Map<String, List<String>> scopeActions) {
    this.scopeActions = scopeActions;
  }
}
