<?php

$username = @$_REQUEST["username"];
$password = @$_REQUEST["password"];
if (@$_REQUEST["action"]) {
    echo "Your username is $username and your password is $password<br>";
}
?>

<form method="POST">
    <p> username: <input name="username" value="<?=$username?>"></p>
    <p> password: <input name="password" value="<?=$password?>"
                        type="password"></p>
    <input name="action" value="submit" type="submit">
</form>

