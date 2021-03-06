import STATUS_HTTP from "#resources/status.http.js";
import STATUS_WEBSOCKETS from "#resources/status.websockets.js";
import STATUS_JSON_RPC from "#resources/status.json-rpc.js";

const STATUS = { ...STATUS_HTTP, ...STATUS_WEBSOCKETS };

const JSON_RPC_TO_HTTP = {};

for ( const status in STATUS_JSON_RPC ) {
    JSON_RPC_TO_HTTP[status] = STATUS_JSON_RPC[status][0];
    STATUS[status] = STATUS_JSON_RPC[status][1];
}

class Result {
    #status;
    #statusText;
    #exception = false;
    #meta;

    constructor ( status, data, meta ) {
        this.status = status;
        if ( data !== undefined ) this.data = data;
        if ( meta ) this.meta = meta;
    }

    // static
    static get Result () {
        return Result;
    }

    static isResult ( object ) {
        if ( object && typeof object === "object" && ( object instanceof Result || ( "status" in object && "statusText" in object ) ) ) return true;
    }

    static result ( status, data, meta ) {
        return new this.prototype.constructor( status, data, meta );
    }

    static exception ( status, data, meta ) {
        const res = new this.prototype.constructor( status, data, meta );

        res.exception = true;

        return res;
    }

    static try ( res, options = {} ) {
        if ( res === undefined && options.allowUndefined ) {
            return new this.prototype.constructor( 200 );
        }

        // Result object
        else if ( res instanceof Result ) {
            return res;
        }

        // Result-like object
        else if ( this.isResult( res ) ) {
            return new this.prototype.constructor( [res.status, res.statusText] );
        }

        // Error
        else if ( res instanceof Error ) {
            if ( options.keepError ) {
                return new this.prototype.constructor( [500, res.message] );
            }
            else {
                return new this.prototype.constructor( 500 );
            }
        }
        else {
            console.log( Error( `Invalid return value, "Result" object is expected` ) );

            return new this.prototype.constructor( 500 );
        }
    }

    static catch ( e, options = {} ) {
        var res;

        // Result object
        if ( e instanceof Result ) {
            res = e;
        }

        // Result-like object
        else if ( this.isResult( e ) ) {
            res = new this.prototype.constructor( [e.status, e.statusText] );
        }
        else {
            if ( e instanceof Error ) {
                const message = e.stack.substring( 0, e.stack.indexOf( e.message ) + e.message.length + 1 ),
                    stack = e.stack.substring( message.length );

                e.stack = message + Error().stack.replace( /.*\n/, "" ) + stack;
            }
            else {
                e = Error( e );
            }

            if ( !options.silent ) console.log( e );

            if ( options.keepError ) {
                res = new this.prototype.constructor( [500, e.message] );
            }
            else {
                res = new this.prototype.constructor( 500 );
            }
        }

        res.exception = true;

        return res;
    }

    static parse ( res ) {
        var _res;

        // object is plain
        if ( res instanceof Object && res.constructor === Object ) {
            try {
                _res = new this.prototype.constructor( [res.status, res.status_text], res.data, res.meta );
            }
            catch ( e ) {
                console.error( e );

                _res = this.exception( [500, "Invalid API response"] );
            }
        }
        else {
            _res = this.exception( [500, "Invalid API response"] );
        }

        return _res;
    }

    static parseRpc ( msg ) {
        var res;

        try {

            // error
            if ( msg.error ) {
                res = new this.prototype.constructor( [msg.error.code, msg.error.message] );

                if ( msg.error.data?.exception ) res.exception = true;
                res.meta = msg.error.data?.meta;
            }

            // ok
            else {
                res = this.parse( msg.result );
            }
        }
        catch ( e ) {
            res = new this.prototype.constructor( 500 );
        }

        return res;
    }

    static getHttpStatus ( status ) {
        if ( status < 100 ) return JSON_RPC_TO_HTTP[status] || 500;

        if ( status in STATUS ) return status;

        if ( status < 100 ) return 400;
        else if ( status >= 100 && status < 200 ) return 100;
        else if ( status >= 200 && status < 300 ) return 200;
        else if ( status >= 300 && status < 400 ) return 300;
        else if ( status >= 400 && status < 500 ) return 400;
        else return 500;
    }

    static getStatusText ( status ) {
        const statusText = STATUS[status];

        if ( statusText ) return statusText;

        if ( status < 100 ) return STATUS[400];
        if ( status >= 100 && status < 200 ) return STATUS[100];
        else if ( status >= 200 && status < 300 ) return STATUS[200];
        else if ( status >= 300 && status < 400 ) return STATUS[300];
        else if ( status >= 400 && status < 500 ) return STATUS[400];
        else return STATUS[500];
    }

    // properties
    get status () {
        return this.#status;
    }

    set status ( status ) {
        if ( typeof status === "number" ) {
            this.#status = status;
            this.statusText = null;
        }
        else if ( Array.isArray( status ) ) {
            if ( typeof status[0] != "number" ) throw Error( `Result status "${status}" is not a number` );

            this.#status = status[0];
            this.statusText = status[1];
        }

        // Result-like object
        else if ( this.constructor.isResult( status ) ) {
            this.#status = status.status;
            this.statusText = status.statusText;
        }

        // Error
        else if ( status instanceof Error ) {
            this.#status = 500;
            this.statusText = Error.message;
        }
        else {
            throw Error( `Result status "${status}" is not a valid status` );
        }

        // drop exception property
        if ( this.ok ) this.exception = false;
    }

    get statusText () {
        return this.#statusText;
    }

    set statusText ( value ) {
        if ( typeof value !== "string" || value === "" ) {
            this.#statusText = Result.getStatusText( this.#status );
        }
        else {
            this.#statusText = value;
        }
    }

    get exception () {
        return this.#exception;
    }

    set exception ( exception ) {
        if ( this.ok ) {
            this.#exception = false;
        }
        else {
            this.#exception = !!exception;
        }
    }

    get meta () {
        this.#meta ??= {};

        return this.#meta;
    }

    set meta ( value ) {

        // object is plain
        if ( value instanceof Object && value.constructor === Object ) {
            this.#meta = value;
        }
        else {
            throw Error( `Result meta must be a plain object` );
        }
    }

    // status properties
    get ok () {
        return this.#status >= 200 && this.#status < 300;
    }

    get error () {
        return this.#status >= 400 || this.#status < 100;
    }

    get is1xx () {
        return this.#status >= 100 && this.#status < 200;
    }

    get is2xx () {
        return this.#status >= 200 && this.#status < 300;
    }

    get is3xx () {
        return this.#status >= 300 && this.#status < 400;
    }

    get is4xx () {
        return ( this.#status >= 400 && this.#status < 500 ) || this.#status < 100;
    }

    get is5xx () {
        return this.#status >= 500;
    }

    // public
    toString () {
        return `${this.status} ${this.statusText}`;
    }

    toJSON () {
        return {
            "status": this.#status,
            "status_text": this.#statusText,
            "exception": this.#exception,
            "data": this.data,
            "meta": this.#meta,
        };
    }

    toRpc ( id ) {
        var res;

        if ( !this.ok ) {
            res = {
                "jsonrpc": "2.0",
                "error": {
                    "code": this.#status,
                    "message": this.#statusText,
                    "data": {
                        "exception": this.exception,
                        "meta": this.meta,
                    },
                },
            };
        }
        else {
            res = {
                "jsonrpc": "2.0",
                "result": this,
            };
        }

        if ( id ) res.id = id;

        return res;
    }
}

const result = Result.result.bind( Result );

Object.setPrototypeOf( result, Result );

export default result;
