//https://www.telerik.com/blogs/json-web-token-jwt-implementation-using-nodejs

//Convert a string to Base64:
const toBase64 = obj => {
   // converts the obj to a string
   const str = JSON.stringify (obj);
   // returns string converted to base64
   return Buffer.from(str).toString ('base64');
};

//Replace special symbols in a Base64 string:
const replaceSpecialChars = b64string => {
// create a regex to match any of the characters =,+ or / and replace them with their // substitutes
  return b64string.replace (/[=+/]/g, charToBeReplaced => {
    switch (charToBeReplaced) {
      case '=':
        return '';
      case '+':
        return '-';
      case '/':
        return '_';
    }
  });
};

// suppose we have this header
const header = {
  alg: 'HS256',
  typ: 'JWT',
};
const b64Header = toBase64 (header);
const jwtB64Header = replaceSpecialChars(b64Header);
console.log ("the header is: ",jwtB64Header); 
//OUTPUTS the header is: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9





// a sample payload 
const payload = {
  iss: 'a_random_server_name',//information about the server that issued the token
  exp: 872990,// tokens expiry date in milliseconds
  // information about some random user
  name: 'John Bobo',
  email: 'myemail@test.com',
  isHuman: true,
};
// converts payload to base64
const b64Payload = toBase64 (payload);
const jwtB64Payload = replaceSpecialChars (b64Payload);
console.log ("the payload is: ",jwtB64Payload);
//OUTPUTS the payload is:     eyJpc3MiOiJhX3JhbmRvbV9zZXJ2ZXJfbmFtZSIsImV4cCI6ODcyOTkwLCJuYW1lIjoiSm9obiBCb2JvIiwiZW1haWwiOiJteWVtYWlsQHRlc3QuY29tIiwiaXNIdW1hbiI6dHJ1ZX0




// bring in the crypto module
const crypto = require ('crypto');
const createSignature =(jwtB64Header,jwtB64Payload,secret)=>{
// create a HMAC(hash based message authentication code) using sha256 hashing alg
    let signature = crypto.createHmac ('sha256', secret);

// use the update method to hash a string formed from our jwtB64Header a period and 
//jwtB64Payload 
    signature.update (jwtB64Header + '.' + jwtB64Payload);

//signature needs to be converted to base64 to make it usable
    signature = signature.digest ('base64');

//of course we need to clean the base64 string of URL special characters
    signature = replaceSpecialChars (signature);
    return signature
}
// create your secret to sign the token
const secret = 'super_secret_society';
const signature= createSignature(jwtB64Header,jwtB64Payload,secret);
console.log ("the signature is: ",signature);
//OUTPUTS the signature is HcfGayoGu_YCpdwSMUABvWTwD2SZQHgv7l4n8cUc_Bc



//we now combine the results of the header,payload and signatue
const jsonWebToken = jwtB64Header + '.' + jwtB64Payload + '.' + signature;
console.log ("the JWT is :",jsonWebToken);
//OUTPUTS:"the JWT is :"        eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhX3JhbmRvbV9zZXJ2ZXJfbmFtZSIsImV4cCI6ODcyOTkwLCJuYW1lIjoiSm9obiBCb2JvIiwiZW1haWwiOiJteWVtYWlsQHRlc3QuY29tIiwiaXNIdW1hbiI6dHJ1ZX0.HcfGayoGu_YCpdwSMUABvWTwD2SZQHgv7l4n8cUc_Bc