package eeg.central

import grails.compiler.GrailsCompileStatic
import groovy.transform.EqualsAndHashCode
import groovy.transform.ToString

@GrailsCompileStatic
@EqualsAndHashCode(includes='username')
@ToString(includes='username', includeNames=true, includePackage=false)
class AppUser implements Serializable {

    private static final long serialVersionUID = 1

    String username
    String password
    String email
    boolean enabled = true
    boolean accountExpired
    boolean accountLocked
    boolean passwordExpired
    Date termsAcceptedAt

    Set<AppRole> getAuthorities() {
        (AppUserAppRole.findAllByAppUser(this) as List<AppUserAppRole>)*.appRole as Set<AppRole>
    }

    static constraints = {
        password nullable: false, blank: false, password: true
        username nullable: false, blank: false, unique: true
        email nullable: false
        termsAcceptedAt nullable: true
    }

    static mapping = {
	    password column: '`password`'
    }
}
