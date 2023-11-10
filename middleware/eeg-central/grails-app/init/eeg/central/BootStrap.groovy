package eeg.central

import grails.gorm.transactions.Transactional
import grails.util.Environment

@Transactional
class BootStrap {

    @Transactional
    def setupDevUsers() {
        final boolean flush = true
        final boolean failOnError = true


        def martin = AppUser.findOrCreateWhere(username: "martin@maigner.net")
        martin.password = "1234"
        martin.save(flush: flush, failOnError: failOnError)

        def adminRole = AppRole.findOrCreateWhere(authority: "ROLE_ADMIN")
        adminRole.save(flush: flush, failOnError: failOnError)


        def admins =  new RoleGroup(name: 'Admins')
        admins.save(flush: flush, failOnError: failOnError)


        RoleGroupRole.findOrCreateWhere(roleGroup: admins, role: adminRole).save(flush: flush, failOnError: failOnError)

        UserRoleGroup.findOrCreateWhere(user: martin, roleGroup: admins).save(flush: flush, failOnError: failOnError)
    }

    def init = { servletContext ->

        switch (Environment.current) {
            case Environment.DEVELOPMENT:
                setupDevUsers()
                break
            case Environment.TEST:
                //setupTestUsers()
                break
            case Environment.PRODUCTION:
                break
        }


    }
    def destroy = {
    }
}
