module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  "rules": {  
  	// For source code, disable now, might enable in the future
	"no-useless-escape": "off",
	"prefer-const": "off",
	"no-prototype-builtins": "off",
	"no-useless-catch": "off",
	"no-case-declarations": "off",
	"no-fallthrough": "off",
	"no-control-regex": "off",
	"no-self-assign": "off",
	"@typescript-eslint/no-var-requires": "off",
	"@typescript-eslint/no-non-null-assertion": "off",
	"@typescript-eslint/no-inferrable-types": "off",
	"@typescript-eslint/no-explicit-any": "off",
	"@typescript-eslint/no-unused-vars": "off",
	"@typescript-eslint/no-extra-semi": "off",
	
	// For other code, might enable in the future
	//"no-unreachable": "off",
	//"no-empty": "off",
	//"no-fallthrough": "off",
	//"no-unsafe-finally": "off",
	//"no-undef": "off",
	//"@typescript-eslint/ban-types": "off",
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
};