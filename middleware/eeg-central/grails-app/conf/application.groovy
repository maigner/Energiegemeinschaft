
// Added by the Spring Security Core plugin:
grails.plugin.springsecurity.userLookup.userDomainClassName = 'eeg.central.AppUser'
grails.plugin.springsecurity.userLookup.authorityJoinClassName = 'eeg.central.AppUserAppRole'
grails.plugin.springsecurity.authority.className = 'eeg.central.AppRole'
grails.plugin.springsecurity.controllerAnnotations.staticRules = [
        [pattern: '/',               access: ['ROLE_AUTHENTICATED']],
        [pattern: '/error',          access: ['permitAll']],
        [pattern: '/index',          access: ['ROLE_AUTHENTICATED']],
        [pattern: '/index.gsp',      access: ['ROLE_ADMIN']],
        [pattern: '/shutdown',       access: ['ROLE_ADMIN']],
        [pattern: '/assets/**',      access: ['ROLE_ADMIN']],
        [pattern: '/**/js/**',       access: ['permitAll']],
        [pattern: '/**/css/**',      access: ['permitAll']],
        [pattern: '/**/images/**',   access: ['permitAll']],
        [pattern: '/**/favicon.ico', access: ['permitAll']],
        [pattern: '/console/**', 	 access: ['ROLE_ADMIN']],
        [pattern: '/static/console/**', access: ['ROLE_ADMIN']],
]

grails.plugin.springsecurity.filterChain.chainMap = [
        [pattern: '/assets/**',      filters: 'none'],
        [pattern: '/**/js/**',       filters: 'none'],
        [pattern: '/**/css/**',      filters: 'none'],
        [pattern: '/**/images/**',   filters: 'none'],
        [pattern: '/**/favicon.ico', filters: 'none'],

        //Stateless chain. used for REST access
        [
                pattern: '/api/**',
                filters: 'JOINED_FILTERS,-anonymousAuthenticationFilter,-exceptionTranslationFilter,-authenticationProcessingFilter,-securityContextPersistenceFilter,-rememberMeAuthenticationFilter'
        ],


        //Traditional chain
        [
                pattern: '/**',
                filters: 'JOINED_FILTERS,-restTokenValidationFilter,-restExceptionTranslationFilter'
        ]
]

grails.plugin.springsecurity.onInteractiveAuthenticationSuccessEvent = { e, appCtx ->
    // handle InteractiveAuthenticationSuccessEvent
}

grails.plugin.springsecurity.onAbstractAuthenticationFailureEvent = { e, appCtx ->
    // handle AbstractAuthenticationFailureEvent
}

grails.plugin.springsecurity.onAuthenticationSuccessEvent = { e, appCtx ->
    // handle AuthenticationSuccessEvent
}

grails.plugin.springsecurity.onAuthenticationSwitchUserEvent = { e, appCtx ->
    // handle AuthenticationSwitchUserEvent
}

grails.plugin.springsecurity.onAuthorizationEvent = { e, appCtx ->
    // handle AuthorizationEvent
}
