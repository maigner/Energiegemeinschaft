import { handle as authenticationHandle } from "./auth";
import { authorizationHandle } from "./auth";
import { sequence } from '@sveltejs/kit/hooks';


export const handle = sequence(authenticationHandle, authorizationHandle)