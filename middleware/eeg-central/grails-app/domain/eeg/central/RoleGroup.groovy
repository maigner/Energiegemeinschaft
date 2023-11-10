package eeg.central

import groovy.transform.EqualsAndHashCode
import groovy.transform.ToString
import grails.compiler.GrailsCompileStatic

@GrailsCompileStatic
@EqualsAndHashCode(includes='name')
@ToString(includes='name', includeNames=true, includePackage=false)
class RoleGroup implements Serializable {

	private static final long serialVersionUID = 1

	String name

	Set<AppRole> getAuthorities() {
		(RoleGroupRole.findAllByRoleGroup(this) as List<RoleGroupRole>)*.role as Set<AppRole>
	}

	static constraints = {
		name nullable: false, blank: false, unique: true
	}

	static mapping = {
		cache true
	}
}
