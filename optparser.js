/** option table example
var option_table=[
    {'short':"-n", 'long':"--name", 'dest':"name",
        help:"the name registerd in PROXY", metavar:'cache'},
    {'short':"-b", 'long':"--bind", dest:"bind", 
        metavar:"tcp://127.0.0.1:8881",help:"bind this server address"},
    {'short':"-s", 'long':"--server", dest:"server", 
        metavar:"tcp://127.0.0.1:11211",help:"interactive with this server"}
]*/
exports.parse=function(option_table,argv){
    if(!argv){
        argv=process.argv;
    }
    if(argv[0]=='node'){
        argv=argv.slice(2);
    }else{
        argv=argv.slice(1);
    }
    var options={},
        i,
        option=false,
        mode=false;
    for(i=0;i<argv.length;i++){
        raw_arg=argv[i];
        if(raw_arg.substr(0,2)=='--'){
            mode='long';
        }
        if(raw_arg.substr(0,1)=='-'){
            mode='short';
        }
        if(mode===false){
            console.error("wrong option:"+raw_arg);
            process.exit(255);
        }
        
        option_table.forEach(function(o){
            if(o[mode]==raw_arg){
                option=o;
            }
            });
        if(option===false){
            //not found option
            console.error("no this option:"+raw_arg);
            process.exit(255);
        }
        i++;
        if(i>=argv.length||argv[i].substr(0,1)=='-'){
            console.error(option.help+"\nexample:"+option.metavar);
            process.exit(255);
        }
        options[option.dest]=argv[i];
        
        mode=false;
        option=false;
    }
    option_table.forEach(function(option){
        if(option.notnull===true){
            if(typeof options[option.dest]=='undefined'){
                console.error(option.help+"\nexample:"+option.metavar);
                process.exit(255);
            }
        }
        if(typeof option.default!='undefined' && typeof options[option.dest] =='undefined'){
            options[option.dest]=option.default;
        }
    });
    return options;
}

