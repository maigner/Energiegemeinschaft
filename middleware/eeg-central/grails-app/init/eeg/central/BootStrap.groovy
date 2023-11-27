package eeg.central

import grails.gorm.transactions.Transactional
import grails.util.Environment

@Transactional
class BootStrap {

    @Transactional
    def setupDevUsers() {
        final boolean flush = true
        final boolean failOnError = true

        def exists = AppUser.findByUsername("martin@maigner.net")
        if (exists) {
            println "exists."
            return
        }

        def martin = AppUser.findOrCreateWhere(username: "martin@maigner.net")
        martin.password = "1234"
        martin.email = "martin@maigner.net"
        martin.save(flush: flush, failOnError: failOnError)

        def adminRole = AppRole.findOrCreateWhere(authority: "ROLE_ADMIN")
        adminRole.save(flush: flush, failOnError: failOnError)

        def userRole = AppUserAppRole.findOrCreateWhere(
                appUser: martin,
                appRole: adminRole
        )
        userRole.save(flush: flush, failOnError: failOnError)

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