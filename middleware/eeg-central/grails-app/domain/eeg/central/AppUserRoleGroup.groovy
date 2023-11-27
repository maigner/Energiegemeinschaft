package eeg.central

import grails.gorm.DetachedCriteria
import groovy.transform.ToString
import org.codehaus.groovy.util.HashCodeHelper
import grails.compiler.GrailsCompileStatic

@GrailsCompileStatic
@ToString(cache=true, includeNames=true, includePackage=false)
class AppUserRoleGroup implements Serializable {

	private static final long serialVersionUID = 1

	AppUser appUser
	RoleGroup roleGroup

	@Override
	boolean equals(other) {
		if (other instanceof AppUserRoleGroup) {
			other.appUserId == appUser?.id && other.roleGroupId == roleGroup?.id
		}
	}

    @Override
	int hashCode() {
	    int hashCode = HashCodeHelper.initHash()
        if (appUser) {
            hashCode = HashCodeHelper.updateHash(hashCode, appUser.id)
		}
		if (roleGroup) {
		    hashCode = HashCodeHelper.updateHash(hashCode, roleGroup.id)
		}
		hashCode
	}
	
	static AppUserRoleGroup get(long appUserId, long roleGroupId) {
		criteriaFor(appUserId, roleGroupId).get()
	}

	static boolean exists(long appUserId, long roleGroupId) {
		criteriaFor(appUserId, roleGroupId).count()
	}

	private static DetachedCriteria criteriaFor(long appUserId, long roleGroupId) {
		AppUserRoleGroup.where {
			appUser == AppUser.load(appUserId) &&
			roleGroup == RoleGroup.load(roleGroupId)
		}
	}

	static AppUserRoleGroup create(AppUser appUser, RoleGroup roleGroup, boolean flush = false) {
		def instance = new AppUserRoleGroup(appUser: appUser, roleGroup: roleGroup)
		instance.save(flush: flush)
		instance
	}

	static boolean remove(AppUser u, RoleGroup rg) {
		if (u != null && rg != null) {
			AppUserRoleGroup.where { appUser == u && roleGroup == rg }.deleteAll()
		}
	}

	static int removeAll(AppUser u) {
		u == null ? 0 : AppUserRoleGroup.where { appUser == u }.deleteAll() as int
	}

	static int removeAll(RoleGroup rg) {
		rg == null ? 0 : AppUserRoleGroup.where { roleGroup == rg }.deleteAll() as int
	}

	static constraints = {
	    roleGroup nullable: false
		appUser nullable: false, validator: { AppUser u, AppUserRoleGroup ug ->
			if (ug.roleGroup?.id) {
				if (AppUserRoleGroup.exists(u.id, ug.roleGroup.id)) {
					return ['userGroup.exists']
				}
			}
		}
	}

	static mapping = {
		id composite: ['roleGroup', 'appUser']
		version false
	}
}
