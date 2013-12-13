var conn = new Mongo();
var db = conn.getDB("test");
var coll = db.users;
coll.insert({ 
"_id" : "john", 
"pw" : "30e4e6a3faac9fec39f65164540415c934f9bed06eb6eac889628dc77f78a397",
"name" : "john", 
"email" : "john@john.com" });
coll.insert({ 
"_id" : "peter", 
"pw" : "d4ba0e49c67696bf46f092d00748e05953655b9322d337a81deba28794c1926b", 
"name" : "peter", 
"email" : "peter@peter.com" });
coll.insert({ 
"_id" : "admin", 
"pw" : "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918", 
"name" : "admin", 
"email" : "admin@admin.com" });
