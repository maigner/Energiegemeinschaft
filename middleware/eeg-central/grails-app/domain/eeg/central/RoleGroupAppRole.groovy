package eeg.central

import grails.gorm.DetachedCriteria
import groovy.transform.ToString

import org.codehaus.groovy.util.HashCodeHelper
import grails.compiler.GrailsCompileStatic

@GrailsCompileStatic
@ToString(cache=true, includeNames=true, includePackage=false)
class RoleGroupAppRole implements Serializable {

	private static final long serialVersionUID = 1

	RoleGroup roleGroup
	AppRole appRole

	@Override
	boolean equals(other) {
		if (other instanceof RoleGroupAppRole) {
			other.appRoleId == appRole?.id && other.roleGroupId == roleGroup?.id
		}
	}

	@Override
	int hashCode() {
	    int hashCode = HashCodeHelper.initHash()
        if (roleGroup) {
            hashCode = HashCodeHelper.updateHash(hashCode, roleGroup.id)
		}
		if (appRole) {
		    hashCode = HashCodeHelper.updateHash(hashCode, appRole.id)
		}
		hashCode
	}

	static RoleGroupAppRole get(long roleGroupId, long appRoleId) {
		criteriaFor(roleGroupId, appRoleId).get()
	}

	static boolean exists(long roleGroupId, long appRoleId) {
		criteriaFor(roleGroupId, appRoleId).count()
	}

	private static DetachedCriteria criteriaFor(long roleGroupId, long appRoleId) {
		RoleGroupAppRole.where {
			roleGroup == RoleGroup.load(roleGroupId) &&
			appRole == AppRole.load(appRoleId)
		}
	}

	static RoleGroupAppRole create(RoleGroup roleGroup, AppRole appRole, boolean flush = false) {
		def instance = new RoleGroupAppRole(roleGroup: roleGroup, appRole: appRole)
		instance.save(flush: flush)
		instance
	}

	static boolean remove(RoleGroup rg, AppRole r) {
		if (rg != null && r != null) {
			RoleGroupAppRole.where { roleGroup == rg && appRole == r }.deleteAll()
		}
	}

	static int removeAll(AppRole r) {
		r == null ? 0 : RoleGroupAppRole.where { appRole == r }.deleteAll() as int
	}

	static int removeAll(RoleGroup rg) {
		rg == null ? 0 : RoleGroupAppRole.where { roleGroup == rg }.deleteAll() as int
	}

	static constraints = {
	    roleGroup nullable: false
		appRole nullable: false, validator: { AppRole r, RoleGroupAppRole rg ->
			if (rg.roleGroup?.id) {
				if (RoleGroupAppRole.exists(rg.roleGroup.id, r.id)) {
				    return ['roleGroup.exists']
				}
			}
		}
	}

	static mapping = {
		id composite: ['roleGroup', 'appRole']
		version false
	}
}
