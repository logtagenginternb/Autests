import ts from "typescript";
import * as path from 'path';
import * as fs from 'fs';

class Dependency {
    Name;
    FilePath;
    Source;
    Aliases;
    Methods;
    Properties;
    UsedMethods = [];
}

function getClassNode() {
    let classdec;
    sourceFile.forEachChild((child) => {
        if (child.kind === ts.SyntaxKind.ClassDeclaration) {
            classdec = child;
        }
    })
    return classdec;
}

function getDependencyNames() {
    let deps = [];
    sourceFile.forEachChild((node) => {
        if (node.kind === 272) {
            if (node.moduleSpecifier.text.includes('./')) {
                for (let element of node.importClause.namedBindings.elements) {
                    let dependency = new Dependency(element.name.text);
                    dependency.Name = element.name.text;
                    dependency.FilePath = node.moduleSpecifier.text;
                    deps.push(dependency);
                }
            }
        }
    });
    return deps;
}

function getAliases(dependency) {
    dependency.Aliases = [dependency.Name];
    classNode.forEachChild((child) => {
        if (child.kind === 176) {
            child.forEachChild((x) => {
                if (x.kind === 169) {
                    let z;
                    x.forEachChild((y) => {
                        if (y.kind === 80) { z = y }
                        if (y.kind === 183) {
                            if (dependency.Name === y.getFullText().trim()) { dependency.Aliases.push(z.getFullText().trim()) }
                        }
                    });
                }
            })
        }
    });
    return dependency;
}

function findPropertyAccesses(classNode) {
    let props = []
    classNode.forEachChild((child) => {
        if (child.kind === ts.SyntaxKind.MethodDeclaration) {
            child.forEachChild((node) => {
                node.forEachChild((x) => x.forEachChild((y) => {
                    y.forEachChild((z) => {
                        if (z.kind === 211 && z.expression.kind !== 110) {
                            props.push(z.expression);
                        }
                    });
                }));
            });
        }
    });
    return props;
}

function processPath(dependency) {
    let absolutePath = path.resolve(path.dirname(fileName), dependency.FilePath) + '.ts';
    if (fs.existsSync(absolutePath)) dependency.Source = ts.createSourceFile(absolutePath, fs.readFileSync(absolutePath, 'utf-8'), ts.ScriptTarget.Latest);
    return dependency
}

function findDependencyMethods(dependency) {
    dependency.Methods = []
    dependency.Source.forEachChild((x) => {
        if (x.kind === 263) {
            x.forEachChild((y) => {
                if (y.kind === 174) {
                    y.forEachChild((z) => {
                        if (z.kind === 80) {
                            dependency.Methods.push(z.escapedText);
                        }
                    })
                }
            });
        }
    });
    return dependency;
}

function findDependencyProperties(dependency) {
    dependency.Properties = [];
    dependency.Source.forEachChild((x) => {
        if (x.kind === 263) {
            x.forEachChild((y) => {
                if (y.kind === 172) {
                    let pub = false;
                    y.forEachChild((z) => {
                        if (z.kind === 125) pub = true;
                        if (z.kind === 80 && pub) dependency.Properties.push(z.escapedText);
                    });
                }
            });
        }
    });
    return dependency;
}

function visit(node, dependency) {
    if (ts.isCallExpression(node)) {
        let text = node.expression.getText().split('.');
        for (let i = 0; i < text.length; i++) {
            if (dependency.Aliases.includes(text[i]) && dependency.Methods.includes(text[i + 1])) {
                if (!dependency.UsedMethods.includes(text[i + 1])) {
                    dependency.UsedMethods.push(text[i + 1]);
                }
            }
        }
    }
    node.forEachChild((child) => { visit(child, dependency) });
}

function copyImports(){
    let imports = "import { ComponentFixture, TestBed } from '@angular/core/testing';\r\n";
    imports += 'import {' + classNode.name.getText() + "} from './" +  path.basename(fileName).slice(0, -3) + "';\r\n";
    sourceFile.forEachChild((x) => {
        if (x.kind === 272){
            imports += x.getFullText()
        }
    })
    return imports;
}

function writeDescribe(dep_list){
    let describe = '';
    describe += 'describe(' + "'" + classNode.name.getText() + ":', () => {\r\n";
    describe += '\tlet component: ' + classNode.name.getText() + ';\r\n';
    describe += '\tlet fixture: ComponentFixture<' + classNode.name.getText() + '>;\r\n\r\n';
    dep_list.forEach((dep) => {
        describe += '\tlet ' + dep.Name.charAt(0).toLowerCase() + dep.Name.slice(1) + ': jasmine.SpyObj<' + dep.Name + '>;\r\n';
    })
    describe += '\r\n';
    describe += writeBeforeEach(dep_list);
    describe += writeIt();
    describe += '});'
    return describe;
}
function writeBeforeEach(dep_list){
    let beforeEach = '\tbeforeEach( async () => {\r\n';
    dep_list.forEach((dep) => {
        let methods = '[';
        dep.UsedMethods.forEach((method) => {
            if (methods === '['){
                methods += "'" + method + "'";
            }
            else{
                methods += ', ' + "'" + method + "'";
            }
        })
        if (methods === '[') methods += "'method'";
        methods += ']';
        beforeEach += '\t\t' + dep.Name.charAt(0).toLowerCase() + dep.Name.slice(1) + ' = jasmine.createSpyObj(' + dep.Name + ', '+ methods + ');\r\n';
    });
    beforeEach += writeTestBed(dep_list);

    beforeEach += '\t\tTestBed.createComponent(' + classNode.name.getText() + ');\r\n';
    beforeEach += '\t\tfixture.componentInstance;\r\n';
    beforeEach += '\t});\r\n'
    return beforeEach;
}

function writeTestBed(dep_list){
    let testBed = '\t\tawait TestBed.configureTestingModule({\r\n';
    testBed += '\t\t\timports: [],\r\n';
    testBed += '\t\t\tdeclarations: [' + classNode.name.getText() + '],\r\n';
    testBed += '\t\t\tproviders: [\r\n';
    dep_list.forEach((dep) => {
        testBed += '\t\t\t\t{ provide: ' + dep.Name + ', useValue: ' + dep.Name.charAt(0).toLowerCase() + dep.Name.slice(1) + '},\r\n'
    });
    testBed += '\t\t\t],\r\n';
    testBed += '\t\t}).compileComponents();\r\n';
    return testBed;
}

function writeIt(){
    let it = "\tit('should create', () => {\r\n";
    it += '\t\texpect(component).toBeTruthy();\r\n'
    it += '\t});\r\n';
    return it;
}

if (!process.argv[2]){
    console.log('please provide a typescript file');
    process.exit();
}

// C:\src\LogTagOnline-dev\LogtagOnline.Web\ClientApp\app\components\location\location.component.ts

const fileName = process.argv[2];

const newFileName = path.resolve(path.dirname(fileName), path.basename(fileName)).slice(0, -3) + '.spec.ts';

const host = ts.createCompilerHost({});

const program = ts.createProgram([fileName], {}, host);

const sourceFile = program.getSourceFile(fileName);

const typeChecker = program.getTypeChecker();

const classNode = getClassNode();

let props = findPropertyAccesses(classNode);

let dep_list = getDependencyNames();

dep_list = dep_list.map((dep) => getAliases(dep));

dep_list = dep_list.map((dep) => processPath(dep));

dep_list = dep_list.map((dep) => findDependencyMethods(dep));

dep_list = dep_list.map((dep) => findDependencyProperties(dep));

dep_list.forEach((dep) => {
    visit(classNode, dep);
});

let fileContent = '';

fileContent += copyImports() + '\r\n\r\n';

fileContent += writeDescribe(dep_list);

fs.writeFileSync(newFileName, fileContent, 'utf-8');
console.log("complete");