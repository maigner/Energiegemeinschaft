package eeg.central

import grails.gorm.transactions.Transactional

@Transactional
class BootStrap {

    @Transactional
    def setupUsers() {
        final boolean flush = true
        final boolean failOnError = true


        def martin = User.findOrCreateWhere(username: "martin@maigner.net")
        martin.password = "1234"
        martin.save(flush: flush, failOnError: failOnError)

        def adminRole = Role.findOrCreateWhere(authority: "ROLE_ADMIN")
        adminRole.save(flush: flush, failOnError: failOnError)


        def admins =  new RoleGroup(name: 'Admins')
        admins.save(flush: flush, failOnError: failOnError)


        RoleGroupRole.findOrCreateWhere(roleGroup: admins, role: adminRole).save(flush: flush, failOnError: failOnError)

        UserRoleGroup.findOrCreateWhere(user: martin, roleGroup: admins).save(flush: flush, failOnError: failOnError)
    }

    def init = { servletContext ->

        setupUsers()

    }
    def destroy = {
    }
}
