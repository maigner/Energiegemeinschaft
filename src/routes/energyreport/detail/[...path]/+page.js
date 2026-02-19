
export const prerender = true;
export const ssr = false;

export function load({ params }) {
    // params.path will be an array of segments
    //const filePath = '/' + params.path.join('/');

    //console.log({params});


    


    return {
        path: params.path
    };
}