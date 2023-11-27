package eeg.central

import grails.gorm.DetachedCriteria
import groovy.transform.ToString

import org.codehaus.groovy.util.HashCodeHelper
import grails.compiler.GrailsCompileStatic

@GrailsCompileStatic
@ToString(cache=true, includeNames=true, includePackage=false)
class AppUserAppRole implements Serializable {

	private static final long serialVersionUID = 1

	AppUser appUser
	AppRole appRole

	@Override
	boolean equals(other) {
		if (other instanceof AppUserAppRole) {
			other.appUserId == appUser?.id && other.appRoleId == appRole?.id
		}
	}

    @Override
	int hashCode() {
	    int hashCode = HashCodeHelper.initHash()
        if (appUser) {
            hashCode = HashCodeHelper.updateHash(hashCode, appUser.id)
		}
		if (appRole) {
		    hashCode = HashCodeHelper.updateHash(hashCode, appRole.id)
		}
		hashCode
	}

	static AppUserAppRole get(long appUserId, long appRoleId) {
		criteriaFor(appUserId, appRoleId).get()
	}

	static boolean exists(long appUserId, long appRoleId) {
		criteriaFor(appUserId, appRoleId).count()
	}

	private static DetachedCriteria criteriaFor(long appUserId, long appRoleId) {
		AppUserAppRole.where {
			appUser == AppUser.load(appUserId) &&
			appRole == AppRole.load(appRoleId)
		}
	}

	static AppUserAppRole create(AppUser appUser, AppRole appRole, boolean flush = false) {
		def instance = new AppUserAppRole(appUser: appUser, appRole: appRole)
		instance.save(flush: flush)
		instance
	}

	static boolean remove(AppUser u, AppRole r) {
		if (u != null && r != null) {
			AppUserAppRole.where { appUser == u && appRole == r }.deleteAll()
		}
	}

	static int removeAll(AppUser u) {
		u == null ? 0 : AppUserAppRole.where { appUser == u }.deleteAll() as int
	}

	static int removeAll(AppRole r) {
		r == null ? 0 : AppUserAppRole.where { appRole == r }.deleteAll() as int
	}

	static constraints = {
	    appUser nullable: false
		appRole nullable: false, validator: { AppRole r, AppUserAppRole ur ->
			if (ur.appUser?.id) {
				if (AppUserAppRole.exists(ur.appUser.id, r.id)) {
				    return ['userRole.exists']
				}
			}
		}
	}

	static mapping = {
		id composite: ['appUser', 'appRole']
		version false
	}
}
